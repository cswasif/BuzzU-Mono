/**
 * useOptimalStun — Probes STUN servers once and picks the fastest ones.
 *
 * Architecture:
 *   1. Pre-warm fires immediately on import (overlaps with WASM load)
 *   2. Once WASM is ready, runs 2 more probe rounds for statistical accuracy
 *   3. Feeds all RTT samples into the Rust WASM StunProber for analysis
 *   4. Locks in the top N servers for the entire session
 *
 * Probe-once strategy:
 *   For a dating/chat app connections are sporadic — users match, chat, then
 *   disconnect. We probe once at page load, then use those results for every
 *   match in the session. Live WebRTC candidate-pair RTT feedback refines the
 *   ranking organically without any background polling overhead.
 *
 *   `reprobeNow()` is exposed for edge cases (network change, ICE restart)
 *   but never fires automatically.
 *
 * Why throwaway PCs?
 *   Browsers don't expose raw UDP. The only way to measure STUN RTT from
 *   the browser is to create a RTCPeerConnection with a single STUN server
 *   and time how quickly the srflx ICE candidate arrives. This is exactly
 *   what the browser does internally — we just measure it.
 */

import { useState, useEffect, useCallback } from 'react';
import { useWasm } from './useWasm';

// ── All known STUN servers to probe ──────────────────────────────────

const ALL_STUN_SERVERS = [
  'stun:stun.cloudflare.com:3478',
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun3.l.google.com:19302',
  'stun:stun4.l.google.com:19302',
];

/** How many servers to return as "optimal" */
const TOP_N = 3;

/** Detect mobile once at import time (used to tune probe aggressiveness) */
const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
);

/**
 * Timeout per probe (ms). If no srflx candidate arrives in this time → failure.
 * Mobile gets a shorter timeout (2s) because:
 *   - Creating 7 throwaway PCs is heavier on mobile GPUs / battery
 *   - A STUN server >2s on mobile is useless anyway (user experience is terrible)
 *   - Shorter timeout = less time holding sockets open = less memory pressure
 */
const PROBE_TIMEOUT_MS = IS_MOBILE ? 2000 : 3000;

/** Number of probe rounds to run for accuracy */
const PROBE_ROUNDS = 3;

/** Delay between probe rounds (ms). Longer on mobile to let GC reclaim PC memory. */
const ROUND_DELAY_MS = IS_MOBILE ? 800 : 500;

export interface StunProbeResult {
  url: string;
  mean_rtt_ms: number;
  median_rtt_ms: number;
  p95_rtt_ms: number;
  jitter_ms: number;
  reliability: number;
  score: number;
  probe_count: number;
  fail_count: number;
}

export interface UseOptimalStunResult {
  /** Top N fastest STUN servers (RTCIceServer format) */
  optimalServers: RTCIceServer[];
  /** Full ranking data for all probed servers */
  ranking: StunProbeResult[];
  /** Whether initial probing is still in progress */
  isProbing: boolean;
  /** Manually trigger a re-probe */
  reprobeNow: () => void;
}

// ── Singleton state (shared across hook instances) ───────────────────

let globalProberInstance: any = null;  // Rust StunProber
let globalRanking: StunProbeResult[] = [];
let globalOptimalServers: RTCIceServer[] = [];
let globalIsProbing = false;
let globalListeners: Set<() => void> = new Set();
let globalProbePromise: Promise<void> | null = null;

function notifyListeners() {
  globalListeners.forEach(cb => cb());
}

/**
 * Probe a single STUN server using a throwaway RTCPeerConnection.
 * Returns RTT in ms, or null if timed out.
 */
async function probeSingleServer(stunUrl: string): Promise<number | null> {
  return new Promise<number | null>((resolve) => {
    let resolved = false;
    const startTime = performance.now();

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: stunUrl }],
      iceCandidatePoolSize: 0,
    });

    const cleanup = () => {
      try {
        pc.onicecandidate = null;
        pc.onicecandidateerror = null;
        pc.close();
      } catch (_) { /* noop */ }
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(null); // timeout = failure
      }
    }, PROBE_TIMEOUT_MS);

    pc.onicecandidate = (event) => {
      if (resolved) return;

      if (event.candidate && event.candidate.type === 'srflx') {
        // Got a server-reflexive candidate — this is the STUN response
        const rtt = performance.now() - startTime;
        resolved = true;
        clearTimeout(timer);
        cleanup();
        resolve(rtt);
      }
    };

    pc.onicecandidateerror = () => {
      // Don't resolve on error — wait for timeout in case another candidate comes
    };

    // Create a data channel to force ICE gathering
    pc.createDataChannel('stun-probe');

    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          cleanup();
          resolve(null);
        }
      });
  });
}

// ── Pre-warm (fires immediately on import — overlaps with WASM load) ─
// Runs ONE probe round using pure browser APIs *before* WASM is ready.
// By the time WASM initialises (~200-500ms), we already have RTT data
// for every server. This eliminates dead time and shaves an entire
// round off the probing pipeline.

interface PreWarmEntry { url: string; rtt: number; ts: number }
const preWarmResults: PreWarmEntry[] = [];
let preWarmDone = false;

void (async () => {
  try {
    if (IS_MOBILE) {
      // Mobile: stagger probes in batches of 4 to reduce PC resource pressure
      for (let i = 0; i < ALL_STUN_SERVERS.length; i += 4) {
        const batch = ALL_STUN_SERVERS.slice(i, i + 4);
        await Promise.all(batch.map(async (url) => {
          const rtt = await probeSingleServer(url);
          if (rtt !== null) preWarmResults.push({ url, rtt, ts: Date.now() });
        }));
      }
    } else {
      // Desktop: probe all servers in parallel (fast, plenty of resources)
      const probes = ALL_STUN_SERVERS.map(async (url) => {
        const rtt = await probeSingleServer(url);
        if (rtt !== null) {
          preWarmResults.push({ url, rtt, ts: Date.now() });
        }
      });
      await Promise.all(probes);
    }
  } catch (_) { /* best-effort — never block init */ }
  preWarmDone = true;
  console.log(
    '[useOptimalStun] Pre-warm complete:',
    preWarmResults.length, '/', ALL_STUN_SERVERS.length, 'servers responded',
    IS_MOBILE ? '(mobile mode)' : '(desktop mode)',
  );
})();

/**
 * Run all probing rounds and feed data into the Rust StunProber.
 */
async function runProbing(prober: any): Promise<void> {
  if (globalIsProbing) return;
  globalIsProbing = true;
  notifyListeners();

  try {
    // ── Ingest pre-warm data (collected before WASM loaded) ──────────
    if (preWarmResults.length > 0) {
      for (const { url, rtt, ts } of preWarmResults) {
        prober.record_rtt(url, rtt, BigInt(ts));
      }
      console.log('[useOptimalStun] Ingested', preWarmResults.length, 'pre-warm RTT samples');
      preWarmResults.length = 0; // clear so they're not re-ingested
    }

    // If pre-warm already provided 1 round, run fewer remaining rounds
    const rounds = preWarmDone ? Math.max(1, PROBE_ROUNDS - 1) : PROBE_ROUNDS;

    for (let round = 0; round < rounds; round++) {
      if (round > 0) {
        await new Promise(r => setTimeout(r, ROUND_DELAY_MS));
      }

      // Probe all servers in parallel
      const probePromises = ALL_STUN_SERVERS.map(async (url) => {
        const rtt = await probeSingleServer(url);
        const now = Date.now();

        if (rtt !== null) {
          prober.record_rtt(url, rtt, BigInt(now));
        } else {
          prober.record_failure(url, BigInt(now));
        }
      });

      await Promise.all(probePromises);
    }

    // Get ranking from Rust
    const rankingJson = prober.get_ranking_json(BigInt(Date.now()));
    const ranking: StunProbeResult[] = JSON.parse(rankingJson || '[]');
    globalRanking = ranking;

    // Get top N URLs
    const bestUrlsJson = prober.get_best_urls_json(TOP_N, BigInt(Date.now()));
    const bestUrls: string[] = JSON.parse(bestUrlsJson || '[]');
    globalOptimalServers = bestUrls.map(url => ({ urls: url }));

    console.log('[useOptimalStun] Probing complete. Ranking:', ranking);
    console.log('[useOptimalStun] Optimal servers:', bestUrls);
  } catch (err) {
    console.error('[useOptimalStun] Probing failed:', err);
    // Fall back to all servers if probing fails
    globalOptimalServers = ALL_STUN_SERVERS.map(url => ({ urls: url }));
  } finally {
    globalIsProbing = false;
    notifyListeners();
  }
}

export function useOptimalStun(): UseOptimalStunResult {
  const { wasm, isLoading: wasmLoading } = useWasm();
  const [, forceUpdate] = useState(0);

  // Register as a listener for global state changes
  useEffect(() => {
    const listener = () => forceUpdate(c => c + 1);
    globalListeners.add(listener);
    return () => { globalListeners.delete(listener); };
  }, []);

  // Initialize prober and run ONE probe when WASM is ready.
  // Results are locked in for the entire session — no periodic re-probing.
  // Live WebRTC RTT feedback refines rankings organically.
  useEffect(() => {
    if (wasmLoading || !wasm) return;

    // Create singleton prober
    if (!globalProberInstance) {
      try {
        globalProberInstance = new wasm.StunProber();
        // Register all servers
        ALL_STUN_SERVERS.forEach(url => globalProberInstance.add_server(url));
        console.log('[useOptimalStun] Rust StunProber initialized with', ALL_STUN_SERVERS.length, 'servers');
      } catch (err) {
        console.warn('[useOptimalStun] Failed to create StunProber (WASM module may not include it yet). Falling back to defaults.');
        globalOptimalServers = ALL_STUN_SERVERS.slice(0, TOP_N).map(url => ({ urls: url }));
        notifyListeners();
        return;
      }
    }

    // Run initial probing (only once globally — probe-once strategy)
    if (!globalProbePromise && globalRanking.length === 0) {
      globalProbePromise = runProbing(globalProberInstance);
    }
  }, [wasm, wasmLoading]);

  const reprobeNow = useCallback(() => {
    if (globalProberInstance && !globalIsProbing) {
      globalProbePromise = runProbing(globalProberInstance);
    }
  }, []);

  return {
    optimalServers: globalOptimalServers.length > 0
      ? globalOptimalServers
      : ALL_STUN_SERVERS.slice(0, TOP_N).map(url => ({ urls: url })), // fallback while probing
    ranking: globalRanking,
    isProbing: globalIsProbing,
    reprobeNow,
  };
}

// ── Bilateral exchange helpers (called by useWebRTC) ─────────────────

/**
 * Get the local STUN ranking as a JSON string for bilateral exchange.
 * Called by useWebRTC when a peer connects to share our ranking data.
 */
export function getLocalRankingJson(): string {
  if (globalProberInstance) {
    try {
      return globalProberInstance.get_ranking_json(BigInt(Date.now()));
    } catch (_) { /* noop */ }
  }
  return '[]';
}

/**
 * Merge a remote peer's STUN ranking with ours (bilateral analysis).
 * Returns the combined ranking — servers fast for BOTH peers score best.
 * Used for optimal TURN relay selection and ICE restart decisions.
 */
export function mergePeerRanking(peerRankingJson: string): StunProbeResult[] {
  if (globalProberInstance) {
    try {
      const mergedJson = globalProberInstance.merge_peer_ranking(
        peerRankingJson,
        BigInt(Date.now()),
      );
      return JSON.parse(mergedJson || '[]');
    } catch (err) {
      console.warn('[useOptimalStun] Failed to merge peer ranking:', err);
    }
  }
  return globalRanking;
}

/**
 * Feed a real WebRTC candidate-pair RTT measurement back into the prober.
 * These carry 2× weight in the Rust engine because they reflect the
 * *actual* connection path quality, not a synthetic probe.
 */
export function recordLiveRtt(stunUrl: string, rttMs: number): void {
  if (globalProberInstance) {
    try {
      globalProberInstance.record_live_rtt(stunUrl, rttMs, BigInt(Date.now()));
    } catch (_) { /* noop */ }
  }
}

/** Static fallback if WASM isn't available — returns first 3 servers */
export const FALLBACK_STUN_SERVERS: RTCIceServer[] = ALL_STUN_SERVERS.slice(0, TOP_N).map(url => ({ urls: url }));
