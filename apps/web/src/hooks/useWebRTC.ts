import { useCallback, useRef, useEffect } from 'react';
import { useSignalingContext } from '../context/SignalingContext';
import { useSessionStore } from '../stores/sessionStore';
import { useScreenShareStore } from '../stores/screenShareStore';
import { useIceServers } from './useIceServers';
import { getLocalRankingJson, mergePeerRanking, recordLiveRtt } from './useOptimalStun';
import { createPeerConnection, getBrowserInfo } from '../utils/browserCompatibility';

export type PeerConnectionState = 
  | { type: 'new' }
  | { type: 'connecting'; isOfferer: boolean; startTime: number }
  | { type: 'connected'; startTime: number; connectionTime: number }
  | { type: 'disconnected'; lastState: string; timestamp: number }
  | { type: 'failed'; reason: string; timestamp: number }
  | { type: 'closed' };

export interface UseWebRTCResult {
  createPeerConnection: (targetPeerId: string, localStream?: MediaStream, isOfferer?: boolean) => Promise<RTCPeerConnection>;
  closePeerConnection: (targetPeerId: string) => void;
  closeAllPeerConnections: () => void;
  initiateCall: (targetPeerId: string, localStream: MediaStream) => Promise<void>;
  requestRenegotiation: (targetPeerId: string, reason?: string) => Promise<void>;
  onDataChannel: (callback: (channel: RTCDataChannel, from: string) => void) => void;
  getConnectionStats: (targetPeerId: string) => Promise<RTCStatsReport | null>;
  setLocalStream: (stream: MediaStream | null) => void;
  isDataChannelOpen: (targetPeerId: string) => boolean;
  waitForDataChannelOpen: (targetPeerId: string, timeoutMs?: number) => Promise<boolean>;
  getPeerConnection: (targetPeerId: string) => RTCPeerConnection | undefined;
  getPeerConnections: () => Map<string, RTCPeerConnection>;
  applyTurnFallback: (targetPeerId: string) => void;
  isFallbackActive: (targetPeerId: string) => boolean;
  getConnectionState: (targetPeerId: string) => PeerConnectionState;
}

// Whether the current browser is Firefox (setCodecPreferences is broken on FF answerer).
// References:
//   • Jitsi BrowserCapabilities.ts: disables setCodecPreferences entirely on Firefox
//     https://bugzilla.mozilla.org/show_bug.cgi?id=1917800
//   • Whereby P2pRtcManager.ts: uses SDP munging on Firefox instead of setCodecPreferences
const isFirefox = typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent);

async function preferH264Codec(pc: RTCPeerConnection, isOffer = true): Promise<RTCOfferOptions> {
  const offerOptions: RTCOfferOptions = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true,
  };

  // setCodecPreferences must ONLY be called when creating OFFERS, never answers.
  // The answerer's SDP must be a strict subset of the offerer's codec list.
  // Cross-browser codec format differences (Chrome vs Firefox) cause SDP parse
  // failures on the offerer when the answerer mutates its codec preferences.
  //
  // Additionally, setCodecPreferences is completely broken on Firefox when
  // the local endpoint is the answerer (Mozilla Bug #1917800). Both Jitsi and
  // Whereby disable it on Firefox entirely.
  if (!isOffer || isFirefox) {
    return offerOptions;
  }

  // Prefer H.264 on ALL platforms — hardware encode/decode is available
  // on virtually all modern GPUs (NVENC, AMF, VideoToolbox, MediaCodec).
  // VP8 falls back to software encoding which adds ~10-15 ms encode latency.
  try {
    const transceivers = pc.getTransceivers();
    const videoTransceivers = transceivers.filter(t =>
      t.sender.track?.kind === 'video' || t.receiver.track?.kind === 'video'
    );

    if (videoTransceivers.length > 0) {
      const capabilities = RTCRtpReceiver.getCapabilities('video');
      if (capabilities) {
        const codecs = capabilities.codecs
          .filter(codec => {
            const mimeType = codec.mimeType.toLowerCase();
            return mimeType.includes('h264') ||
              mimeType.includes('avc1') ||
              mimeType.includes('vp8') ||
              mimeType.includes('vp9');
          })
          .sort((a, b) => {
            const aMime = a.mimeType.toLowerCase();
            const bMime = b.mimeType.toLowerCase();
            // H.264 first → hardware-accelerated on all platforms
            if (aMime.includes('h264') && !bMime.includes('h264')) return -1;
            if (!aMime.includes('h264') && bMime.includes('h264')) return 1;
            return 0;
          });

        if (codecs.length > 0) {
          for (const transceiver of videoTransceivers) {
            try { transceiver.setCodecPreferences(codecs); } catch { /* transceiver may be stopped */ }
          }
          console.log('[useWebRTC] H.264 preferred for hardware acceleration');
        }
      }
    }

    // ── Opus + RED audio codec preference ─────────────────────────
    // RED (Redundant Encoding Data, RFC 2198) wraps the previous Opus
    // frame inside the current packet. If one packet is lost, the
    // redundant copy in the *next* packet fills the gap — no retransmit
    // needed. This virtually eliminates audible glitches under ≤5% loss.
    const audioTransceivers = transceivers.filter(t =>
      t.sender.track?.kind === 'audio' || t.receiver.track?.kind === 'audio'
    );
    if (audioTransceivers.length > 0) {
      const audioCaps = RTCRtpReceiver.getCapabilities('audio');
      if (audioCaps) {
        const audioCodecs = [...audioCaps.codecs].sort((a, b) => {
          const aMime = a.mimeType.toLowerCase();
          const bMime = b.mimeType.toLowerCase();
          // RED first → redundancy negotiates; then Opus
          if (aMime.includes('red') && !bMime.includes('red')) return -1;
          if (!aMime.includes('red') && bMime.includes('red')) return 1;
          return 0;
        });
        for (const transceiver of audioTransceivers) {
          try { transceiver.setCodecPreferences(audioCodecs); } catch { /* transceiver may be stopped */ }
        }
        console.log('[useWebRTC] Opus+RED preferred for audio resilience');
      }
    }
  } catch (err) {
    console.warn('[useWebRTC] Failed to set codec preferences:', err);
  }

  return offerOptions;
}

// Global reference for connection type monitoring
declare global {
  interface Window {
    __peerConnections?: Map<string, RTCPeerConnection>;
  }
}

export function useWebRTC(): UseWebRTCResult {
  const { stunServers, turnServers } = useIceServers();
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const fallbackTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const connectionTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const { peerId, avatarSeed } = useSessionStore();
  const context = useSignalingContext();
  const { sendMessage, onMessage } = context;

  const dataChannelCallbackRef = useRef<((channel: RTCDataChannel, from: string) => void) | null>(null);
  const activeDataChannelsRef = useRef<Map<string, RTCDataChannel[]>>(new Map());
  const candidateBufferRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const candidateDedupRef = useRef<Map<string, Set<string>>>(new Map());
  const peerStateRef = useRef<Map<string, PeerConnectionState>>(new Map());
  const iceGatheringCompleteRef = useRef<Map<string, boolean>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const dataChannelOpenStatesRef = useRef<Map<string, boolean>>(new Map());
  const stunRankingSentRef = useRef<Set<string>>(new Set());

  // ── Fallback-active guard ──────────────────────────────────────
  // Prevents useConnectionResilience from re-triggering applyTurnFallback
  // while one is already in progress for a given peer.
  const fallbackActiveRef = useRef<Set<string>>(new Set());

  // ── ICE restart retry tracking ──────────────────────────────────
  const iceRestartAttemptsRef = useRef<Map<string, number>>(new Map());
  const iceRestartTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const MAX_ICE_RESTARTS = 4;
  const ICE_RESTART_BASE_DELAY_MS = 2000;
  const ICE_RESTART_MAX_DELAY_MS = 15000;

  // ── Intentional leave guard ─────────────────────────────────────
  // Set BEFORE closing peer connections on intentional skip/leave.
  // ICE restart logic checks this to avoid reconnecting a peer that
  // was deliberately disconnected.
  const intentionalLeaveRef = useRef<Set<string>>(new Set());
  // Global flag: set when closeAllPeerConnections is called intentionally
  const intentionalLeaveAllRef = useRef(false);

  // ── Perfect Negotiation State ──────────────────────────────
  // State for the "Perfect Negotiation" algorithm to prevent glare.
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const ignoreOfferRef = useRef<Map<string, boolean>>(new Map());
  const skipNextNegotiationRef = useRef<Map<string, boolean>>(new Map());
  const negotiationQueuedRef = useRef<Map<string, boolean>>(new Map());

  // ── Adaptive Bitrate (ABR) State ──────────────────────────────
  const lastAbrStatsRef = useRef<Map<string, {
    packetsLost: number;
    timestamp: number;
    currentBitrate: number;
    stableSince: number;
  }>>(new Map());

  // ── Per-peer negotiation lock ───────────────────────────────
  // Serializes offer/answer/TURN-fallback processing per peer so that
  // concurrent signaling messages don't stomp on each other's state.
  const negotiationLockRef = useRef<Map<string, Promise<void>>>(new Map());
  const withNegotiationLock = useCallback((peerId: string, fn: () => Promise<void>): Promise<void> => {
    const prev = negotiationLockRef.current.get(peerId) ?? Promise.resolve();
    const next = prev.then(fn, fn); // run fn after previous completes (even on error)
    negotiationLockRef.current.set(peerId, next);
    return next;
  }, []);

  const logEvent = useCallback((level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>) => {
    const payload = { level, event, ts: Date.now(), ...data };
    if (level === 'error') {
      console.error(JSON.stringify(payload));
    } else if (level === 'warn') {
      console.warn(JSON.stringify(payload));
    } else {
      console.log(JSON.stringify(payload));
    }
  }, []);

  const getCandidateKey = useCallback((candidate: RTCIceCandidateInit) => {
    return `${candidate.candidate ?? ''}|${candidate.sdpMid ?? ''}|${candidate.sdpMLineIndex ?? ''}`;
  }, []);

  const registerCandidate = useCallback((peerId: string, candidate: RTCIceCandidateInit) => {
    if (!candidate.candidate) {
      return false;
    }
    const key = getCandidateKey(candidate);
    let seen = candidateDedupRef.current.get(peerId);
    if (!seen) {
      seen = new Set();
      candidateDedupRef.current.set(peerId, seen);
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }, [getCandidateKey]);

  const requestRenegotiation = useCallback(async (targetPeerId: string, reason?: string) => {
    await withNegotiationLock(targetPeerId, async () => {
      const pc = peerConnectionsRef.current.get(targetPeerId);
      if (!pc || pc.signalingState === 'closed') return;

      if (makingOfferRef.current.get(targetPeerId) || pc.signalingState !== 'stable') {
        negotiationQueuedRef.current.set(targetPeerId, true);
        if (reason) {
          console.log('[useWebRTC] Queued renegotiation for', targetPeerId, 'reason:', reason);
        }
        return;
      }

      negotiationQueuedRef.current.delete(targetPeerId);
      makingOfferRef.current.set(targetPeerId, true);
      try {
        const offerOptions = await preferH264Codec(pc);
        const offer = await pc.createOffer(offerOptions);
        if (pc.signalingState !== 'stable') {
          negotiationQueuedRef.current.set(targetPeerId, true);
          return;
        }
        await pc.setLocalDescription(offer);
        sendMessage({
          type: 'Offer',
          from: peerId,
          to: targetPeerId,
          payload: JSON.stringify(pc.localDescription),
        });
        if (reason) {
          console.log('[useWebRTC] Renegotiation offer sent to', targetPeerId, 'reason:', reason);
        }
      } catch (err) {
        console.error('[useWebRTC] Renegotiation failed for:', targetPeerId, err);
      } finally {
        makingOfferRef.current.set(targetPeerId, false);
      }
    });
  }, [peerId, sendMessage, withNegotiationLock]);

  // Ref to break the circular dependency: applyTurnFallback ↔ createPeerConnectionWrapper
  const createPcRef = useRef<(id: string, s?: MediaStream, o?: boolean, t?: boolean) => Promise<RTCPeerConnection>>(null!);

  const applyTurnFallback = useCallback(async (targetPeerId: string) => {
    await withNegotiationLock(targetPeerId, async () => {
      const oldPc = peerConnectionsRef.current.get(targetPeerId);
      if (!oldPc) return;

      // Check if already connected — no need to fallback
      if (oldPc.iceConnectionState === 'connected' || oldPc.iceConnectionState === 'completed') return;
      if (oldPc.signalingState === 'closed') return;

      // ── Skip if a fallback is already in progress for this peer ──
      if (fallbackActiveRef.current.has(targetPeerId)) {
        console.log(`[useWebRTC] Fallback already active for ${targetPeerId} — skipping`);
        return;
      }

      // ── Enforce attempt limit — stop infinite TURN fallback loops ──
      const attempts = iceRestartAttemptsRef.current.get(targetPeerId) ?? 0;
      if (attempts >= MAX_ICE_RESTARTS) {
        console.log(`[useWebRTC] Max TURN fallback attempts (${MAX_ICE_RESTARTS}) reached for ${targetPeerId} — giving up`);
        iceRestartAttemptsRef.current.delete(targetPeerId);
        try { if ((oldPc.signalingState as string) !== 'closed') oldPc.close(); } catch (_) { }
        peerConnectionsRef.current.delete(targetPeerId);
        return;
      }
      iceRestartAttemptsRef.current.set(targetPeerId, attempts + 1);
      fallbackActiveRef.current.add(targetPeerId);

      // ── Clear old timers to prevent stale timers firing ────────────
      const oldTimer = fallbackTimersRef.current.get(targetPeerId);
      if (oldTimer) { clearTimeout(oldTimer); fallbackTimersRef.current.delete(targetPeerId); }
      const oldTimeout = connectionTimeoutRef.current.get(targetPeerId);
      if (oldTimeout) { clearTimeout(oldTimeout); connectionTimeoutRef.current.delete(targetPeerId); }
      const oldIceTimer = iceRestartTimersRef.current.get(targetPeerId);
      if (oldIceTimer) { clearTimeout(oldIceTimer); iceRestartTimersRef.current.delete(targetPeerId); }

      console.log(`[useWebRTC] Falling back to TURN for ${targetPeerId} (attempt ${attempts + 1}/${MAX_ICE_RESTARTS}) — recreating PeerConnection with TURN servers`);

      try {
        // ── Close old PC & clean up associated state ─────────────────
        // Close old data channels
        const oldChannels = activeDataChannelsRef.current.get(targetPeerId) || [];
        for (const ch of oldChannels) {
          try { ch.close(); } catch (_) { }
        }
        activeDataChannelsRef.current.delete(targetPeerId);
        dataChannelOpenStatesRef.current.delete(targetPeerId);
        candidateBufferRef.current.delete(targetPeerId);
        iceGatheringCompleteRef.current.delete(targetPeerId);
        stunRankingSentRef.current.delete(targetPeerId);

        // Close old PC
        try { if ((oldPc.signalingState as string) !== 'closed') oldPc.close(); } catch (_) { }
        peerConnectionsRef.current.delete(targetPeerId);

        // ── Create fresh PC (with TURN included from the start) ─────
        const newPc = await createPcRef.current(targetPeerId, localStreamRef.current ?? undefined, true, true);

        // ── Send fresh offer ────────────────────────────────────────
        const offer = await newPc.createOffer();
        await newPc.setLocalDescription(offer);
        sendMessage({
          type: 'Offer',
          from: peerId,
          to: targetPeerId,
          payload: JSON.stringify(offer)
        });
        console.log('[useWebRTC] TURN fallback: new offer sent to', targetPeerId);

        // ── Set a retry timer for this attempt ──────────────────────
        const retryDelay = Math.min(
          ICE_RESTART_BASE_DELAY_MS * Math.pow(1.5, attempts),
          ICE_RESTART_MAX_DELAY_MS
        );
        const retryTimer = setTimeout(() => {
          fallbackActiveRef.current.delete(targetPeerId);
          const currentPc = peerConnectionsRef.current.get(targetPeerId);
          if (!currentPc || currentPc !== newPc) return; // stale
          if (currentPc.iceConnectionState === 'connected' || currentPc.iceConnectionState === 'completed') return;
          applyTurnFallback(targetPeerId);
        }, retryDelay);
        fallbackTimersRef.current.set(targetPeerId, retryTimer);

      } catch (err) {
        console.error('[useWebRTC] TURN fallback failed:', err);
      } finally {
        // Release lock after a short delay so immediate re-triggers are blocked
        setTimeout(() => fallbackActiveRef.current.delete(targetPeerId), 1000);
      }
    });
  }, [sendMessage, peerId, withNegotiationLock]);

  const browser = getBrowserInfo();

  const createPeerConnectionWrapper = useCallback(async (
    targetPeerId: string,
    localStream?: MediaStream,
    isOfferer: boolean = false
  ): Promise<RTCPeerConnection> => {
    const existingPC = peerConnectionsRef.current.get(targetPeerId);
    if (existingPC) {
      // If we're the offerer but the PC was already created (e.g., by handling a signaling message),
      // we still need to ensure a file-transfer DataChannel exists.
      if (isOfferer) {
        const existingChannels = activeDataChannelsRef.current.get(targetPeerId) || [];
        const hasFileTransfer = existingChannels.some(ch => ch.label === 'file-transfer');
        if (!hasFileTransfer) {
          console.log('[useWebRTC] Existing PC found but missing file-transfer channel, creating one for:', targetPeerId);
          const channel = existingPC.createDataChannel('file-transfer');
          channel.binaryType = 'arraybuffer';

          dataChannelOpenStatesRef.current.set(targetPeerId, false);

          channel.onopen = () => {
            console.log('[useWebRTC] Late-created file-transfer channel OPEN for:', targetPeerId);
            dataChannelOpenStatesRef.current.set(targetPeerId, true);
            if (dataChannelCallbackRef.current) {
              dataChannelCallbackRef.current(channel, targetPeerId);
            }
          };
          channel.onclose = () => {
            console.log('[useWebRTC] Late-created file-transfer channel CLOSED for:', targetPeerId);
            dataChannelOpenStatesRef.current.delete(targetPeerId);
          };
          channel.onerror = (e) => console.error('[useWebRTC] Late-created file-transfer channel ERROR for:', targetPeerId, e);

          existingChannels.push(channel);
          activeDataChannelsRef.current.set(targetPeerId, existingChannels);

          if (dataChannelCallbackRef.current) {
            dataChannelCallbackRef.current(channel, targetPeerId);
          }
        }
      }
      return existingPC;
    }

    // Reset intentional-leave guards — this is a fresh session
    intentionalLeaveAllRef.current = false;
    intentionalLeaveRef.current.delete(targetPeerId);

    // Initial state
    peerStateRef.current.set(targetPeerId, { type: 'connecting', isOfferer, startTime: Date.now() });

    // Parallel ICE: Always provide both STUN and TURN servers to let the browser race them.
    // This eliminates the 5-second wait for users on restrictive networks.
    const allServers = [...stunServers, ...turnServers];

    const pc = createPeerConnection({
      iceServers: allServers,
      bundlePolicy: 'max-bundle',         // Multiplex all media over one transport → 1 ICE gather instead of 3
      iceCandidatePoolSize: 1,             // Pre-gather 1 candidate → saves ~50-100ms on connection setup
    }, browser);

    console.log(`[useWebRTC] Initializing parallel ICE (STUN+TURN) for ${targetPeerId}`);

    if (isOfferer) {
      skipNextNegotiationRef.current.set(targetPeerId, true);
    }

    pc.onnegotiationneeded = async () => {
      if (skipNextNegotiationRef.current.get(targetPeerId)) {
        skipNextNegotiationRef.current.delete(targetPeerId);
        console.log('[useWebRTC] Skipping initial negotiationneeded for:', targetPeerId);
        return;
      }
      console.log('[useWebRTC] Negotiation needed for:', targetPeerId);
      requestRenegotiation(targetPeerId, 'negotiationneeded');
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[useWebRTC] Local ICE candidate generated for:', targetPeerId);
        sendMessage({
          type: 'IceCandidate',
          from: peerId,
          to: targetPeerId,
          payload: JSON.stringify(event.candidate.toJSON())
        });
      } else {
        console.log('[useWebRTC] ICE gathering complete for:', targetPeerId);
        iceGatheringCompleteRef.current.set(targetPeerId, true);
      }
    };

    pc.oniceconnectionstatechange = async () => {
      const state = pc.iceConnectionState;
      console.log('[useWebRTC] ICE state for', targetPeerId, ':', state);

      if (state === 'connected' || state === 'completed') {
        const currentState = peerStateRef.current.get(targetPeerId);
        if (currentState?.type === 'connecting') {
          const connectionTime = Date.now() - currentState.startTime;
          peerStateRef.current.set(targetPeerId, { 
            type: 'connected', 
            startTime: currentState.startTime, 
            connectionTime 
          });
          console.log(`[useWebRTC] Connection established for ${targetPeerId} in ${connectionTime}ms`);
        }

        const timer = fallbackTimersRef.current.get(targetPeerId);
        if (timer) {
          clearTimeout(timer);
          fallbackTimersRef.current.delete(targetPeerId);
        }
        const timeoutTimer = connectionTimeoutRef.current.get(targetPeerId);
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          connectionTimeoutRef.current.delete(targetPeerId);
        }

        // ── Bilateral STUN ranking exchange ────────────────────
        // Send our local ranking to the peer so both sides can compute
        // the optimal bilateral server list for ICE restarts & TURN.
        if (!stunRankingSentRef.current.has(targetPeerId)) {
          stunRankingSentRef.current.add(targetPeerId);
          const rankingJson = getLocalRankingJson();
          if (rankingJson !== '[]') {
            sendMessage({
              type: 'Relay',
              from: peerId,
              to: targetPeerId,
              via: peerId,           // direct send — we ARE the relay hop
              payload: JSON.stringify({ kind: 'stun_ranking', ranking: rankingJson }),
              hop_count: 0,
              timestamp: Date.now(),
            });
            console.log('[useWebRTC] Sent bilateral STUN ranking to', targetPeerId);
          }
        }

        // ── Real-stats feedback loop ──────────────────────────
        // After connection is live, sample the active candidate-pair’s
        // real RTT and feed it back to the Rust StunProber (2× weight).
        // This refines future rankings with actual connection quality.
        setTimeout(async () => {
          try {
            const stats = await pc.getStats();
            stats.forEach((report) => {
              if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                const rtt = report.currentRoundTripTime;
                if (typeof rtt === 'number' && rtt > 0) {
                  // Find which STUN server produced the local candidate
                  const localCandReport = stats.get(report.localCandidateId);
                  const stunUrl = localCandReport?.url;
                  if (stunUrl) {
                    recordLiveRtt(stunUrl, rtt * 1000); // s → ms
                    console.log('[useWebRTC] Fed live RTT', (rtt * 1000).toFixed(1), 'ms for', stunUrl);
                  }
                }
              }
            });
          } catch (_) { /* stats unavailable — non-critical */ }
        }, 3000); // wait 3s for connection to stabilise
      } else if (state === 'failed') {
        peerStateRef.current.set(targetPeerId, { 
          type: 'failed', 
          reason: 'ICE gathering or connection failed',
          timestamp: Date.now() 
        });

        // While tab is hidden, browsers deprioritize WebRTC — ICE failures
        // are transient and self-heal on tab focus. Don't tear down.
        if (document.hidden) {
          console.log('[useWebRTC] ICE failed for', targetPeerId, 'while tab hidden — deferring recovery to visibility change');
          return;
        }
        // Skip recovery if this peer was intentionally disconnected
        if (intentionalLeaveRef.current.has(targetPeerId) || intentionalLeaveAllRef.current) {
          console.log('[useWebRTC] ICE failed for', targetPeerId, 'but leave was intentional — not recovering');
          return;
        }

        // ── Soft ICE Restart Strategy (Inspired by Daily.co) ──────────
        // Triggered by 'failed' state. We use a 'Restart Master' logic:
        // the peer with the lexicographically smaller ID initiates.
        const canInitiate = peerId < targetPeerId;
        if (!canInitiate) {
          console.log(`[useWebRTC] ICE failed for ${targetPeerId}. We are RESTART SLAVE — waiting for offer.`);
          return;
        }

        const attempts = iceRestartAttemptsRef.current.get(targetPeerId) ?? 0;
        if (attempts < 2) { // Try 2 soft restarts before hard fallback
          console.log(`[useWebRTC] ICE failed for ${targetPeerId}. We are RESTART MASTER — attempting soft ICE restart (attempt ${attempts + 1})`);
          iceRestartAttemptsRef.current.set(targetPeerId, attempts + 1);
          try {
            pc.restartIce();
            const offer = await pc.createOffer({ iceRestart: true });
            await pc.setLocalDescription(offer);
            sendMessage({
              type: 'Offer',
              from: peerId,
              to: targetPeerId,
              payload: JSON.stringify(offer)
            });
            return; // Soft restart initiated
          } catch (err) {
            console.error('[useWebRTC] Soft ICE restart failed:', err);
          }
        }

        console.log('[useWebRTC] ICE connection failed for:', targetPeerId, '— triggering hard recovery');
        applyTurnFallback(targetPeerId);
      } else if (state === 'disconnected') {
        const lastState = peerStateRef.current.get(targetPeerId);
        peerStateRef.current.set(targetPeerId, { 
          type: 'disconnected', 
          lastState: lastState?.type || 'unknown',
          timestamp: Date.now() 
        });

        if (document.hidden) {
          console.log('[useWebRTC] ICE disconnected for', targetPeerId, 'while tab hidden — deferring');
          return;
        }
        if (intentionalLeaveRef.current.has(targetPeerId) || intentionalLeaveAllRef.current) return;

        console.log('[useWebRTC] ICE disconnected for:', targetPeerId, '- attempting proactive recovery...');

        // ── Proactive Recovery (Restart Master logic) ────────────────
        // If we are the Master, don't wait for 'failed' (30s). Try a 
        // Soft Restart after 3s of 'disconnected'.
        const canInitiate = peerId < targetPeerId;
        if (canInitiate) {
          const timeout = setTimeout(async () => {
            if (pc && pc.iceConnectionState === 'disconnected') {
              console.log(`[useWebRTC] ICE still disconnected after 3s for ${targetPeerId}. We are MASTER — initiating proactive soft restart.`);
              try {
                pc.restartIce();
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                sendMessage({
                  type: 'Offer',
                  from: peerId,
                  to: targetPeerId,
                  payload: JSON.stringify(offer)
                });
              } catch (err) {
                console.error('[useWebRTC] Proactive soft restart failed:', err);
                applyTurnFallback(targetPeerId); // Fallback to TURN if restart fails
              }
            }
          }, 3000);
          fallbackTimersRef.current.set(targetPeerId, timeout);
        } else {
          // If we are Slave, still set a safety timer to catch cases
          // where Master is dead/offline.
          const timer = setTimeout(() => {
            if (pc && pc.iceConnectionState === 'disconnected') {
              console.log('[useWebRTC] ICE still disconnected (Slave), applying safety TURN fallback for:', targetPeerId);
              applyTurnFallback(targetPeerId);
            }
          }, 5000); // Wait longer as Slave (give Master time)
          fallbackTimersRef.current.set(targetPeerId, timer);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[useWebRTC] Connection state for', targetPeerId, ':', state);

      if (state === 'connected') {
        // ── Successful (re)connection — reset retry counter ────────
        iceRestartAttemptsRef.current.delete(targetPeerId);
        fallbackActiveRef.current.delete(targetPeerId);
        const iceTimer = iceRestartTimersRef.current.get(targetPeerId);
        if (iceTimer) {
          clearTimeout(iceTimer);
          iceRestartTimersRef.current.delete(targetPeerId);
        }

        // ── Screen share audio recovery ───────────────────────────
        // After ICE reconnects, the ScreenShareViewer <video> might have
        // its srcObject stalled. Bump the store to trigger re-attachment.
        const ssState = useScreenShareStore.getState();
        if (ssState.isRemoteSharing && ssState.remoteStream) {
          console.log('[useWebRTC] ICE reconnected — nudging remote screen share stream for playback recovery');
          // Re-set the same stream to trigger React re-render in ScreenShareViewer
          useScreenShareStore.getState().setRemoteSharing(ssState.remoteStream);
        }

        // ── Low-latency sender tuning ─────────────────────────────
        // Tune video/audio senders for minimum latency once ICE connects.
        // Delay 200ms — some browsers need DTLS to finish first.
        setTimeout(() => {
          try {
            const senders = pc.getSenders();
            for (const sender of senders) {
              if (!sender.track) continue;
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
              }

              if (sender.track.kind === 'video') {
                // Camera video: favour smooth framerate over crisp resolution.
                // Screen share senders get tuned separately by useScreenShare.
                const isScreenShare = sender.track.contentHint === 'detail';
                if (!isScreenShare) {
                  params.encodings[0].maxBitrate = browser.isMobile ? 1_500_000 : 2_500_000;
                  params.encodings[0].priority = 'high';
                  params.encodings[0].networkPriority = 'high';
                  params.degradationPreference = 'maintain-framerate';
                } else {
                  // Advanced Differentiated Profile for Screen Share
                  params.encodings[0].maxBitrate = 4_000_000; // 4 Mbps for text clarity
                  params.encodings[0].priority = 'high';
                  params.encodings[0].networkPriority = 'high';
                  params.degradationPreference = 'maintain-resolution';
                  if ('scaleResolutionDownBy' in params.encodings[0]) {
                    params.encodings[0].scaleResolutionDownBy = 1.0;
                  }
                }
              } else if (sender.track.kind === 'audio') {
                const isScreenShareAudio = sender.track.contentHint === 'music';
                const desiredMaxBitrate = isScreenShareAudio ? 192_000 : 64_000;
                const currentMaxBitrate = params.encodings[0].maxBitrate ?? 0;
                params.encodings[0].maxBitrate = Math.max(currentMaxBitrate, desiredMaxBitrate);
                params.encodings[0].priority = 'high';
                params.encodings[0].networkPriority = 'high';
              }
              sender.setParameters(params).catch(() => { });
            }

            // ── Receiver-side low-latency tuning ─────────────────────
            // Minimise decode-to-render latency for BOTH jitter buffer
            // and playout delay.
            //
            // jitterBufferTarget (ms) — how long frames wait in the jitter
            // buffer before being released to the decoder.
            //   Production refs:
            //   • OpenNOW (cloud gaming):  video 12 ms, audio 20 ms
            //   • FlashDesk "low" profile: video 40 ms, audio 25 ms
            //   We use 30 ms across the board — good balance for bidirectional
            //   video chat where ~50 ms RTT is normal.
            //
            // playoutDelayHint (seconds) — Chrome experimental API that
            // signals the desired overall playout delay to the browser's
            // jitter buffer. Lower = less buffering, higher stutter risk.
            //   • OpenNOW: 0.012 s (video), 0.02 s (audio)
            //   • FlashDesk: 0.02 s (video)
            //   We use 0.02 s — aggressive but safe for a chat app.
            const receivers = pc.getReceivers();
            for (const receiver of receivers) {
              const kind = receiver.track?.kind;
              if ('jitterBufferTarget' in receiver) {
                (receiver as any).jitterBufferTarget = kind === 'audio' ? 30 : 30;
              }
              // playoutDelayHint — Chrome 109+ / experimental
              if ('playoutDelayHint' in receiver) {
                (receiver as any).playoutDelayHint = kind === 'audio' ? 0.03 : 0.02;
              }
              // Set contentHint on received tracks — tells the decoder
              // to optimise for motion (faces/camera) rather than detail
              if (kind === 'video' && receiver.track && !receiver.track.contentHint) {
                receiver.track.contentHint = 'motion';
              }
            }
            console.log('[useWebRTC] Senders tuned for low-latency, receivers jitter buffer + playoutDelayHint minimized');
          } catch (_) { /* non-critical */ }
        }, 200);
      } else if (state === 'failed') {
        // ── Intentional leave or tab hidden — skip recovery ───────
        if (intentionalLeaveRef.current.has(targetPeerId) || intentionalLeaveAllRef.current) {
          console.log('[useWebRTC] Connection failed for', targetPeerId, 'but leave was intentional — not restarting ICE');
          return;
        }
        if (document.hidden) {
          console.log('[useWebRTC] Connection failed for', targetPeerId, 'while tab hidden — deferring to visibility change');
          return;
        }
        // ── ICE restart with exponential backoff ──────────────────
        // Don't immediately close the PC — try ICE restart first.
        // Pattern from Abyss/Discord: escalate through ICE restart →
        // TURN fallback → full PC recreation → close.
        const attempts = iceRestartAttemptsRef.current.get(targetPeerId) ?? 0;
        if (attempts < MAX_ICE_RESTARTS) {
          const delay = Math.min(
            ICE_RESTART_BASE_DELAY_MS * Math.pow(1.5, attempts),
            ICE_RESTART_MAX_DELAY_MS
          );
          console.log(`[useWebRTC] Connection failed for ${targetPeerId}, scheduling ICE restart (attempt ${attempts + 1}/${MAX_ICE_RESTARTS}) in ${delay}ms`);
          iceRestartAttemptsRef.current.set(targetPeerId, attempts + 1);

          // Clear any existing timer for this peer
          const existingTimer = iceRestartTimersRef.current.get(targetPeerId);
          if (existingTimer) clearTimeout(existingTimer);

          const timer = setTimeout(() => {
            iceRestartTimersRef.current.delete(targetPeerId);
            const currentPc = peerConnectionsRef.current.get(targetPeerId);
            if (currentPc && currentPc.connectionState !== 'connected' && currentPc.connectionState !== 'closed') {
              applyTurnFallback(targetPeerId);
            }
          }, delay);
          iceRestartTimersRef.current.set(targetPeerId, timer);
        } else {
          console.log(`[useWebRTC] Max ICE restarts (${MAX_ICE_RESTARTS}) reached for ${targetPeerId}, closing`);
          iceRestartAttemptsRef.current.delete(targetPeerId);
          closePeerConnection(targetPeerId);
        }
      } else if (state === 'closed') {
        peerStateRef.current.set(targetPeerId, { type: 'closed' });
        closePeerConnection(targetPeerId);
      }
    };

    pc.onsignalingstatechange = () => {
      if (pc.signalingState === 'stable' && negotiationQueuedRef.current.get(targetPeerId)) {
        negotiationQueuedRef.current.delete(targetPeerId);
        requestRenegotiation(targetPeerId, 'queued');
      }
    };

    const streamToUse = localStream ?? localStreamRef.current;
    if (streamToUse) {
      streamToUse.getTracks().forEach((track) => {
        // Set contentHint for encoder optimization:
        // 'motion' for video → optimize for face/movement, not text sharpness
        if (track.kind === 'video' && !track.contentHint) {
          track.contentHint = 'motion';
        }
        pc.addTrack(track, streamToUse);
      });
    }

    // ── Screen share track restoration on new PC ──────────────────
    // If local screen sharing is active and this is a fresh PC (not the
    // existing one), re-add the screen share tracks so screen share
    // survives full PC recreation after disconnection.
    const screenState = useScreenShareStore.getState();
    if (screenState.isLocalSharing && screenState.localStream) {
      const existingTrackIds = new Set(pc.getSenders().map(s => s.track?.id).filter(Boolean));
      screenState.localStream.getTracks().forEach((track) => {
        if (track.readyState === 'live' && !existingTrackIds.has(track.id)) {
          pc.addTrack(track, screenState.localStream!);
          console.log('[useWebRTC] Restored screen share', track.kind, 'track on new PC for', targetPeerId);
        }
      });
    }

    // ── Voice chat mic track restoration on new PC ────────────────────
    // If local voice chat mic exists and this is a fresh PC,
    // re-add the mic track so voice chat survives full PC recreation.
    const voiceState = (await import('../stores/voiceChatStore')).useVoiceChatStore.getState();
    if (voiceState.localAudioStream) {
      const existingTrackIds = new Set(pc.getSenders().map(s => s.track?.id).filter(Boolean));
      voiceState.localAudioStream.getTracks().forEach((track) => {
        if (track.readyState === 'live' && !existingTrackIds.has(track.id)) {
          pc.addTrack(track, voiceState.localAudioStream!);
          console.log('[useWebRTC] Restored voice chat', track.kind, 'track on new PC for', targetPeerId);
        }
      });
    }

    pc.ontrack = (event) => {
      console.log('[useWebRTC] Received remote track from', targetPeerId, 'kind:', event.track.kind, 'streams:', event.streams.length);

      // ── Immediate low-latency receiver tuning for new tracks ────
      // Apply jitterBufferTarget + playoutDelayHint as soon as each
      // track arrives, not just on ICE connected. This catches tracks
      // that are added after the initial connection (screen share, etc).
      try {
        const receiver = event.receiver;
        const kind = event.track.kind;
        if (receiver && 'jitterBufferTarget' in receiver) {
          (receiver as any).jitterBufferTarget = kind === 'audio' ? 30 : 30;
        }
        if (receiver && 'playoutDelayHint' in receiver) {
          (receiver as any).playoutDelayHint = kind === 'audio' ? 0.03 : 0.02;
        }
        if (kind === 'video' && !event.track.contentHint) {
          event.track.contentHint = 'motion';
        }
      } catch { /* non-critical */ }

      const stream = event.streams[0];
      if (!stream) return;

      // ── Screen share detection ─────────────────────────────────
      // Multiple heuristics, checked in order of reliability:
      //
      // 1. If the remote peer has signaled ScreenShare=true (via signaling
      //    message), any NEW video track is the screen share — even in
      //    text-only chat (no camera track exists yet).
      // 2. If a camera video track already exists, a second video track
      //    is the screen share.
      // 3. Audio tracks that arrive on the SAME MediaStream as the screen
      //    share video must go to the screen share viewer (system audio),
      //    not to the camera/mic stream.
      // 4. Otherwise the first video track is the camera and audio tracks
      //    go to the camera/mic stream.

      const screenShareState = useScreenShareStore.getState();

      if (event.track.kind === 'video') {
        const existingVideoReceivers = pc.getReceivers()
          .filter(r => r.track && r.track.kind === 'video' && r.track.id !== event.track.id && r.track.readyState === 'live');

        const label = (event.track.label || '').toLowerCase();
        const looksLikeScreenShare =
          label.includes('screen') ||
          label.includes('window') ||
          label.includes('display') ||
          label.includes('tab');

        const isScreenShareTrack =
          screenShareState.isRemoteSharing ||
          existingVideoReceivers.length > 0 ||
          looksLikeScreenShare;

        if (isScreenShareTrack) {
          console.log('[useWebRTC] Detected remote SCREEN SHARE video track from', targetPeerId,
            '(signaled:', screenShareState.isRemoteSharing, 'existingVideo:', existingVideoReceivers.length, ')');

          // Ensure the track is enabled - some browsers disable tracks on ICE disruption
          if (event.track.readyState === 'live' && !event.track.enabled) {
            console.log('[useWebRTC] Enabling disabled screen share track from', targetPeerId);
            event.track.enabled = true;
          }

          // Set correct contentHint for the screen share track on the
          // receiver side. contentHint does NOT propagate over WebRTC —
          // the sender sets 'detail' on their end but the receiver gets a
          // fresh track. 'detail' tells the renderer to optimize for text
          // sharpness rather than motion smoothness.
          try { event.track.contentHint = 'detail'; } catch (_) { /* non-critical */ }

          useScreenShareStore.getState().setRemoteSharing(stream);

          const onTrackEnded = () => {
            console.log('[useWebRTC] Remote screen share track ended from', targetPeerId);
            useScreenShareStore.getState().clearRemoteSharing();
          };
          event.track.addEventListener('ended', onTrackEnded);

          // Don't treat mute as ended — ICE disruptions temporarily mute
          // tracks. The track will un-mute when ICE recovers. Only clear
          // on actual 'ended'.
          //
          // Chromium also fires spurious mute/unmute on screen share tracks
          // based on cursor activity (Chromium bug). Debounce the unmute
          // handler to avoid unnecessary store churn.
          let muteDebounceTimer: ReturnType<typeof setTimeout> | null = null;
          event.track.addEventListener('mute', () => {
            if (muteDebounceTimer) { clearTimeout(muteDebounceTimer); muteDebounceTimer = null; }
            console.log('[useWebRTC] Remote screen share track MUTED (ICE disruption?) from', targetPeerId);
          });
          event.track.addEventListener('unmute', () => {
            if (muteDebounceTimer) clearTimeout(muteDebounceTimer);
            muteDebounceTimer = setTimeout(() => {
              console.log('[useWebRTC] Remote screen share track UNMUTED (ICE recovered) from', targetPeerId);
              // Re-set the stream to ensure ScreenShareViewer recovers playback
              const currentState = useScreenShareStore.getState();
              if (currentState.isRemoteSharing) {
                useScreenShareStore.getState().setRemoteSharing(stream);
              }
              muteDebounceTimer = null;
            }, 500); // 500ms debounce: Chromium cursor mute/unmute settles within ~200ms
          });
        } else {
          // First video track with no screen share signal → camera stream
          context.setRemoteStream(new MediaStream(stream));
        }
      } else if (event.track.kind === 'audio') {
        // Audio track: Check if it belongs to the screen share stream.
        // When the sharer calls pc.addTrack(audioTrack, stream) with the
        // SAME MediaStream as the video track, the browser fires separate
        // ontrack events but event.streams[0] is the same MediaStream.
        // If the screen share store already has a remoteStream with the
        // same id, this audio track is screen-share system audio.
        const currentRemoteShareStream = useScreenShareStore.getState().remoteStream;
        const isScreenShareAudio =
          screenShareState.isRemoteSharing && (
            // Same stream as the screen share video track
            (currentRemoteShareStream && stream.id === currentRemoteShareStream.id) ||
            // Or: the screen share was signaled but no stream yet — this audio
            // arrived before/alongside the video, belongs to screen share
            !currentRemoteShareStream
          );

        if (isScreenShareAudio) {
          console.log('[useWebRTC] Detected remote SCREEN SHARE audio track from', targetPeerId);

          // Ensure the audio track is enabled
          if (event.track.readyState === 'live' && !event.track.enabled) {
            console.log('[useWebRTC] Enabling disabled screen share audio track from', targetPeerId);
            event.track.enabled = true;
          }

          // Update the screen share stream so the ScreenShareViewer
          // <video> element picks up the audio track for playback.
          useScreenShareStore.getState().setRemoteSharing(stream);
        } else {
          // Normal camera/mic audio
          context.setRemoteStream(new MediaStream(stream));
        }
      }
    };

    pc.ondatachannel = (event) => {
      console.log('[useWebRTC] Received remote data channel:', event.channel.label, 'from', targetPeerId, 'state:', event.channel.readyState);
      // Ensure binaryType is set for file-transfer
      if (event.channel.label === 'file-transfer') {
        event.channel.binaryType = 'arraybuffer';
        const channelMap = (pc as any).dataChannels || new Map<string, RTCDataChannel>();
        channelMap.set(targetPeerId, event.channel);
        (pc as any).dataChannels = channelMap;

        // Track open state for file-transfer channels
        dataChannelOpenStatesRef.current.set(targetPeerId, false);

        // Set up open handler to update state and trigger callback
        const originalOnOpen = event.channel.onopen;
        event.channel.onopen = (ev) => {
          console.log('[useWebRTC] Remote data channel OPEN:', event.channel.label, 'from', targetPeerId);
          dataChannelOpenStatesRef.current.set(targetPeerId, true);

          // Call original onopen if it exists, preserving 'this' context
          if (originalOnOpen) originalOnOpen.call(event.channel, ev);
        };

        // Track close state
        event.channel.onclose = () => {
          console.log('[useWebRTC] Remote data channel CLOSED:', event.channel.label, 'from', targetPeerId);
          dataChannelOpenStatesRef.current.delete(targetPeerId);
        };
      }

      // Store channel for replay if callback isn't ready
      const channels = activeDataChannelsRef.current.get(targetPeerId) || [];
      channels.push(event.channel);
      activeDataChannelsRef.current.set(targetPeerId, channels);

      if (dataChannelCallbackRef.current) {
        console.log('[useWebRTC] Forwarding remote channel to callback');
        dataChannelCallbackRef.current(event.channel, targetPeerId);
      } else {
        console.warn('[useWebRTC] No dataChannelCallbackRef.current ready yet');
      }
    };

    // If we're the one creating the PC as an offerer, we preemptively create the file-transfer channel
    if (isOfferer || localStream) {
      console.log('[useWebRTC] Creating local data channel "file-transfer" for:', targetPeerId);
      const channel = pc.createDataChannel('file-transfer');
      channel.binaryType = 'arraybuffer';
      const channelMap = (pc as any).dataChannels || new Map<string, RTCDataChannel>();
      channelMap.set(targetPeerId, channel);
      (pc as any).dataChannels = channelMap;

      // Track open state for local data channels
      dataChannelOpenStatesRef.current.set(targetPeerId, false);

      channel.onopen = () => {
        console.log('[useWebRTC] Local data channel "file-transfer" OPEN for:', targetPeerId);
        dataChannelOpenStatesRef.current.set(targetPeerId, true);

        // Trigger callback if registered
        if (dataChannelCallbackRef.current) {
          console.log('[useWebRTC] Forwarding local channel to callback on open');
          dataChannelCallbackRef.current(channel, targetPeerId);
        }
      };
      channel.onclose = () => {
        console.log('[useWebRTC] Local data channel "file-transfer" CLOSED for:', targetPeerId);
        dataChannelOpenStatesRef.current.delete(targetPeerId);
      };
      channel.onerror = (e) => console.error('[useWebRTC] Local data channel "file-transfer" ERROR for:', targetPeerId, e);

      // Store channel for replay
      const channels = activeDataChannelsRef.current.get(targetPeerId) || [];
      channels.push(channel);
      activeDataChannelsRef.current.set(targetPeerId, channels);

      // Notify the local caller about our own created channel immediately (don't wait for open)
      // This allows the caller to set up their own handlers before the channel opens
      if (dataChannelCallbackRef.current) {
        console.log('[useWebRTC] Notifying local caller of locally created channel for:', targetPeerId);
        dataChannelCallbackRef.current(channel, targetPeerId);
      }
    }

    peerConnectionsRef.current.set(targetPeerId, pc);

    // Make peer connections globally accessible for connection type monitoring
    if (typeof window !== 'undefined') {
      const globalConnections = (window as any).__peerConnections as Map<string, RTCPeerConnection> | undefined;
      if (globalConnections) {
        peerConnectionsRef.current.forEach((connection, id) => {
          globalConnections.set(id, connection);
        });
      } else {
        window.__peerConnections = peerConnectionsRef.current;
      }
    }

    // A connection timeout is still useful to detect terminal failures
    const connectionTimer = setTimeout(() => {
      if (peerConnectionsRef.current.get(targetPeerId) !== pc) return; // stale timer
      if (pc.iceConnectionState !== 'connected' && pc.iceConnectionState !== 'completed') {
        console.warn(`[useWebRTC] Connection timeout for ${targetPeerId} after 20s — forcing ICE restart`);
        // We triggere an ICE restart instead of applyTurnFallback since both are already included
        pc.restartIce();
        pc.createOffer({ iceRestart: true }).then(offer => {
          pc.setLocalDescription(offer);
          sendMessage({
            type: 'Offer',
            from: peerId,
            to: targetPeerId,
            payload: JSON.stringify(offer)
          });
        }).catch(err => console.error('[useWebRTC] ICE restart failed during timeout:', err));
      }
    }, 20000);
    connectionTimeoutRef.current.set(targetPeerId, connectionTimer);

    return pc;
  }, [stunServers, turnServers, sendMessage, peerId, browser]);

  // Wire up the ref so applyTurnFallback can call createPeerConnectionWrapper
  // without a circular useCallback dependency.
  createPcRef.current = createPeerConnectionWrapper;

  const setLocalStream = useCallback((stream: MediaStream | null) => {
    localStreamRef.current = stream;
    if (!stream) return;
    peerConnectionsRef.current.forEach((pc) => {
      stream.getTracks().forEach((track) => {
        const hasTrack = pc.getSenders().some((sender) => sender.track?.id === track.id);
        if (!hasTrack) {
          pc.addTrack(track, stream);
        }
      });
    });
  }, []);

  const closeAllPeerConnections = useCallback(() => {
    console.log('[useWebRTC] Closing ALL peer connections (' + peerConnectionsRef.current.size + ' active)');
    // Mark as intentional so ICE restart callbacks don't fire
    intentionalLeaveAllRef.current = true;
    // Reset remote screen share store — remote stream is dead.
    // Local screen capture is preserved (ChatArea manages local lifecycle).
    useScreenShareStore.getState().resetRemoteOnly();
    // simple-peer _destroy pattern — nullify handlers before closing
    peerConnectionsRef.current.forEach((pc) => {
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onconnectionstatechange = null;
      pc.ontrack = null;
      pc.ondatachannel = null;
      try { if (pc.signalingState !== 'closed') pc.close(); } catch (_e) { /* noop */ }
    });
    activeDataChannelsRef.current.forEach((channels) => {
      channels.forEach(ch => {
        ch.onmessage = null;
        ch.onopen = null;
        ch.onclose = null;
        ch.onerror = null;
        try { ch.close(); } catch (_e) { /* noop */ }
      });
    });
    peerConnectionsRef.current.clear();
    activeDataChannelsRef.current.clear();
    candidateBufferRef.current.clear();
    iceGatheringCompleteRef.current.clear();
    dataChannelOpenStatesRef.current.clear();
    stunRankingSentRef.current.clear();
    iceRestartAttemptsRef.current.clear();
    iceRestartTimersRef.current.forEach((timer) => clearTimeout(timer));
    iceRestartTimersRef.current.clear();
    fallbackTimersRef.current.forEach((timer) => clearTimeout(timer));
    fallbackTimersRef.current.clear();
    connectionTimeoutRef.current.forEach((timer) => clearTimeout(timer));
    connectionTimeoutRef.current.clear();
    intentionalLeaveRef.current.clear();
    // Note: intentionalLeaveAllRef stays true until next createPeerConnection
  }, []);

  const closePeerConnection = useCallback((targetPeerId: string) => {
    const pc = peerConnectionsRef.current.get(targetPeerId);
    if (pc) {
      // Mark as intentional so in-flight ICE restart timers bail out
      intentionalLeaveRef.current.add(targetPeerId);
      // Clear remote screen share state — the stream is dead now
      const ssState = useScreenShareStore.getState();
      if (ssState.isRemoteSharing) {
        useScreenShareStore.getState().clearRemoteSharing();
      }
      // simple-peer _destroy pattern: nullify all handlers then close
      // This prevents ghost callbacks from firing after cleanup
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onsignalingstatechange = null;
      pc.onconnectionstatechange = null;
      pc.ontrack = null;
      pc.ondatachannel = null;
      try { pc.close(); } catch (_e) { /* already closed */ }
      peerConnectionsRef.current.delete(targetPeerId);

      // Nullify data channel handlers before discarding
      const channels = activeDataChannelsRef.current.get(targetPeerId);
      if (channels) {
        channels.forEach(ch => {
          ch.onmessage = null;
          ch.onopen = null;
          ch.onclose = null;
          ch.onerror = null;
          try { ch.close(); } catch (_e) { /* noop */ }
        });
      }
      activeDataChannelsRef.current.delete(targetPeerId);
      candidateBufferRef.current.delete(targetPeerId);
      candidateDedupRef.current.delete(targetPeerId);
      makingOfferRef.current.delete(targetPeerId);
      ignoreOfferRef.current.delete(targetPeerId);
      iceGatheringCompleteRef.current.delete(targetPeerId);
      dataChannelOpenStatesRef.current.delete(targetPeerId);
      stunRankingSentRef.current.delete(targetPeerId);
      iceRestartAttemptsRef.current.delete(targetPeerId);
      const iceTimer = iceRestartTimersRef.current.get(targetPeerId);
      if (iceTimer) {
        clearTimeout(iceTimer);
        iceRestartTimersRef.current.delete(targetPeerId);
      }

      const timer = fallbackTimersRef.current.get(targetPeerId);
      if (timer) {
        clearTimeout(timer);
        fallbackTimersRef.current.delete(targetPeerId);
      }

      const connectionTimer = connectionTimeoutRef.current.get(targetPeerId);
      if (connectionTimer) {
        clearTimeout(connectionTimer);
        connectionTimeoutRef.current.delete(targetPeerId);
      }

      console.log('[useWebRTC] Closed peer connection to', targetPeerId);
    }
  }, []);

  const getConnectionStats = useCallback(async (targetPeerId: string): Promise<RTCStatsReport | null> => {
    const pc = peerConnectionsRef.current.get(targetPeerId);
    if (!pc) {
      console.warn('[useWebRTC] No peer connection found for', targetPeerId);
      return null;
    }

    try {
      const stats = await pc.getStats();
      console.log('[useWebRTC] Connection stats for', targetPeerId, ':', stats);

      stats.forEach((report) => {
        if (report.type === 'outbound-rtp' && report.kind === 'video') {
          console.log('[useWebRTC] Outbound video stats:', {
            bytesSent: report.bytesSent,
            packetsSent: report.packetsSent,
            framesEncoded: report.framesEncoded,
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            bitrate: (report.bytesSent / 1000).toFixed(2) + ' kbps',
          });
        }
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          console.log('[useWebRTC] Inbound video stats:', {
            bytesReceived: report.bytesReceived,
            packetsReceived: report.packetsReceived,
            framesDecoded: report.framesDecoded,
            framesDropped: report.framesDropped,
            framesReceived: report.framesReceived,
            jitter: report.jitter,
            bitrate: (report.bytesReceived / 1000).toFixed(2) + ' kbps',
          });
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          console.log('[useWebRTC] Active candidate pair:', {
            localCandidateId: report.localCandidateId,
            remoteCandidateId: report.remoteCandidateId,
            priority: report.priority,
            currentRoundTripTime: report.currentRoundTripTime,
            availableOutgoingBitrate: report.availableOutgoingBitrate,
          });
        }
      });

      return stats;
    } catch (err) {
      console.error('[useWebRTC] Failed to get connection stats:', err);
      return null;
    }
  }, []);

  const initiateCall = useCallback(async (
    targetPeerId: string,
    localStream: MediaStream
  ) => {
    try {
      const pc = await createPeerConnectionWrapper(targetPeerId, localStream);

      const offerOptions = await preferH264Codec(pc);
      const offer = await pc.createOffer(offerOptions);
      await pc.setLocalDescription(offer);

      sendMessage({
        type: 'Offer',
        from: peerId,
        to: targetPeerId,
        payload: JSON.stringify(offer)
      });
      console.log('[useWebRTC] Sent offer to', targetPeerId);
    } catch (err) {
      console.error('[useWebRTC] Failed to initiate call:', err);
      throw err;
    }
  }, [createPeerConnectionWrapper, sendMessage, peerId]);

  const onDataChannel = useCallback((callback: (channel: RTCDataChannel, from: string) => void) => {
    dataChannelCallbackRef.current = callback;

    // Replay any channels already created (regardless of open state)
    // This ensures the callback can set up handlers before the channel opens
    if (callback) {
      activeDataChannelsRef.current.forEach((channels, from) => {
        channels.forEach(channel => {
          console.log('[useWebRTC] Replaying buffered data channel:', channel.label, 'from:', from, 'readyState:', channel.readyState);
          callback(channel, from);
        });
      });
    }
  }, []);

  // Helper function to check if data channel is open and ready
  const isDataChannelOpen = useCallback((targetPeerId: string): boolean => {
    return dataChannelOpenStatesRef.current.get(targetPeerId) || false;
  }, []);

  // Wait for data channel to open with timeout
  const waitForDataChannelOpen = useCallback(async (targetPeerId: string, timeoutMs: number = 20000): Promise<boolean> => {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < timeoutMs) {
      if (dataChannelOpenStatesRef.current.get(targetPeerId)) {
        console.log('[useWebRTC] Data channel confirmed open for:', targetPeerId);
        return true;
      }

      // Check if channel exists but failed
      const pc = peerConnectionsRef.current.get(targetPeerId);
      if (!pc || pc.signalingState === 'closed') {
        console.warn('[useWebRTC] Peer connection closed while waiting for data channel:', targetPeerId);
        return false;
      }

      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    console.warn('[useWebRTC] Data channel open timeout for:', targetPeerId, 'after', timeoutMs, 'ms');
    return false;
  }, []);

  useEffect(() => {
    const handleOfferInternal = async (offer: RTCSessionDescriptionInit, from: string) => {
      await withNegotiationLock(from, async () => {
        try {
          const pc = await createPeerConnectionWrapper(from, localStreamRef.current ?? undefined);

          // Guard: PC may have been closed by a concurrent leave/skip
          if (pc.signalingState === 'closed') {
            console.warn('[useWebRTC] Ignoring offer from', from, '— PC is closed');
            return;
          }

          // ── Perfect Negotiation: Offer glare handling ──────────────────
          const isPolite = peerId < from;
          const makingOffer = makingOfferRef.current.get(from) || false;
          const offerCollision = makingOffer || pc.signalingState !== 'stable';

          ignoreOfferRef.current.set(from, !isPolite && offerCollision);
          if (ignoreOfferRef.current.get(from)) {
            console.log('[useWebRTC] Impolite peer ignoring offer glare from:', from);
            return;
          }

          if (offerCollision) {
            console.log('[useWebRTC] Polite peer rolling back offer glare for:', from);
            await pc.setLocalDescription({ type: 'rollback' });
          }

          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          console.log('[useWebRTC] Set remote offer for:', from);

          const buffered = candidateBufferRef.current.get(from) || [];
          for (const candidate of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          candidateBufferRef.current.delete(from);

          // Re-check: a concurrent handler may have changed the state
          if (pc.signalingState !== 'have-remote-offer') {
            console.warn('[useWebRTC] Skipping answer — PC state changed to', pc.signalingState, 'during offer handling for:', from);
            return;
          }

          const answerOptions = await preferH264Codec(pc, false);
          const answer = await pc.createAnswer(answerOptions);
          await pc.setLocalDescription(answer);

          sendMessage({
            type: 'Answer',
            from: peerId,
            to: from,
            payload: JSON.stringify(answer)
          });
          console.log('[useWebRTC] Sent answer to', from);
        } catch (err) {
          console.error('[useWebRTC] Failed to handle offer:', err);
        }
      });
    };

    const handleAnswerInternal = async (answer: RTCSessionDescriptionInit, from: string) => {
      await withNegotiationLock(from, async () => {
        try {
          const pc = peerConnectionsRef.current.get(from);
          if (!pc) {
            console.warn('[useWebRTC] Ignoring answer from', from, '— no peer connection');
            return;
          }

          // Guard: only accept an answer when we're actually waiting for one.
          // Stale answers arrive after TURN fallback recreates the PC+offer,
          // or after glare resolution already completed the handshake.
          if (pc.signalingState !== 'have-local-offer') {
            console.warn('[useWebRTC] Ignoring stale answer from', from,
              '— PC is in', pc.signalingState, 'state (expected have-local-offer)');
            return;
          }

          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          console.log('[useWebRTC] Set remote answer from', from);

          const buffered = candidateBufferRef.current.get(from) || [];
          for (const candidate of buffered) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          candidateBufferRef.current.delete(from);
        } catch (err) {
          console.error('[useWebRTC] Failed to handle answer:', err);
        }
      });
    };

    const handleIceCandidateInternal = async (candidate: RTCIceCandidateInit, from: string) => {
      try {
        if (!candidate?.candidate) {
          logEvent('warn', 'ice_candidate_empty', { peerId: from });
          return;
        }
        if (!registerCandidate(from, candidate)) {
          logEvent('info', 'ice_candidate_duplicate', { peerId: from });
          return;
        }
        const pc = peerConnectionsRef.current.get(from);
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log('[useWebRTC] Added ICE candidate from', from);
        } else {
          console.log('[useWebRTC] Buffering ICE candidate from', from, '(no remote description yet)');
          const buffered = candidateBufferRef.current.get(from) || [];
          buffered.push(candidate);
          candidateBufferRef.current.set(from, buffered);
        }
      } catch (err) {
        console.error('[useWebRTC] Failed to handle ICE candidate:', err);
        logEvent('error', 'ice_candidate_add_failed', {
          peerId: from,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const unsubs = [
      onMessage('Offer', (msg) => {
        if (msg.from && msg.payload) handleOfferInternal(JSON.parse(msg.payload), msg.from);
      }),
      onMessage('Answer', (msg) => {
        if (msg.from && msg.payload) handleAnswerInternal(JSON.parse(msg.payload), msg.from);
      }),
      onMessage('IceCandidate', (msg) => {
        if (msg.from && msg.payload) handleIceCandidateInternal(JSON.parse(msg.payload), msg.from);
      }),
      // ── Bilateral STUN ranking receiver ──────────────────────
      onMessage('Relay', (msg) => {
        if (msg.from && msg.payload) {
          try {
            const data = JSON.parse(msg.payload);
            if (data.kind === 'stun_ranking' && data.ranking) {
              console.log('[useWebRTC] Received bilateral STUN ranking from', msg.from);
              const merged = mergePeerRanking(data.ranking);
              if (merged.length > 0) {
                console.log('[useWebRTC] Bilateral top servers:',
                  merged.slice(0, 3).map(r => `${r.url} (score: ${r.score})`).join(', '));
              }
            }
          } catch (_) { /* not a stun_ranking relay — ignore */ }
        }
      })
    ];

    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [createPeerConnectionWrapper, sendMessage, onMessage, peerId, withNegotiationLock]);

  // ── Adaptive Bitrate (ABR) Looping Logic ───────────────────────
  useEffect(() => {
    const abrInterval = setInterval(async () => {
      // Skip ABR calculations if tab is hidden to save CPU
      if (typeof document !== 'undefined' && document.hidden) return;

      for (const [targetPeerId, pc] of peerConnectionsRef.current.entries()) {
        if (pc.connectionState !== 'connected') continue;

        try {
          const stats = await pc.getStats();
          let currentStats = lastAbrStatsRef.current.get(targetPeerId) || {
            packetsLost: 0,
            timestamp: Date.now(),
            currentBitrate: 1500000,
            stableSince: Date.now()
          };

          stats.forEach(async (report) => {
            // Monitor Inbound Video for packet loss detection
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              const now = Date.now();
              const deltaMs = now - currentStats.timestamp;
              if (deltaMs < 1500) return; // Need at least 1.5s of data

              const deltaLoss = report.packetsLost - currentStats.packetsLost;
              const lossRate = (deltaLoss / (report.packetsReceived + report.packetsLost)) * 100;

              // Heuristic: If loss > 2%, downshift bitrate aggressively
              if (lossRate > 2) {
                console.log(`[useWebRTC] High packet loss (${lossRate.toFixed(1)}%) detected for ${targetPeerId}. Downshifting bitrate.`);
                currentStats.currentBitrate = Math.max(300000, currentStats.currentBitrate * 0.7);
                currentStats.stableSince = now;
                applyBitrateLimit(pc, currentStats.currentBitrate);
              } else if (now - currentStats.stableSince > 10000) {
                // Monitor available bandwidth estimate from the candidate-pair
                const pairReport = Array.from(stats.values()).find(r => r.type === 'candidate-pair' && r.state === 'succeeded');
                const bwe = pairReport?.availableOutgoingBitrate;
                
                // If stable for 10s and BWE allows it, attempt a small upshift (100kbps)
                let limit = browser.isMobile ? 1500000 : 2500000;
                const videoSenders = pc.getSenders().filter(s => s.track?.kind === 'video' && s.track.readyState === 'live');
                const hasScreenShare = videoSenders.some(s => s.track?.contentHint === 'detail');
                if (hasScreenShare) limit = 4000000;

                // Upshift if current bitrate is below limit AND below 80% of estimated available bandwidth
                const canUpshift = bwe ? (currentStats.currentBitrate < bwe * 0.8) : true;

                if (currentStats.currentBitrate < limit && canUpshift) {
                  currentStats.currentBitrate = Math.min(limit, currentStats.currentBitrate + 100000);
                  console.log(`[useWebRTC] Connection stable (BWE: ${bwe ? (bwe/1000).toFixed(0) : 'N/A'}kbps). Upshifting bitrate for ${targetPeerId} to ${(currentStats.currentBitrate / 1000).toFixed(0)}kbps`);
                  applyBitrateLimit(pc, currentStats.currentBitrate);
                }
                currentStats.stableSince = now;
              }

              currentStats.packetsLost = report.packetsLost;
              currentStats.timestamp = now;
              lastAbrStatsRef.current.set(targetPeerId, currentStats);
            }
          });
        } catch (err) {
          console.warn(`[useWebRTC] ABR stats failed for ${targetPeerId}:`, err);
        }
      }
    }, 2000);

    return () => clearInterval(abrInterval);
  }, [browser.isMobile]);

  const applyBitrateLimit = async (pc: RTCPeerConnection, bitrate: number) => {
    try {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) continue;

          // ── Content-Aware Bitrate Shaping ──────────────────────────
          // During congestion, we maintain high bitrate for 'detail' (Screen Share)
          // and aggressively drop bitrate for 'motion' (Camera).
          const isDetail = sender.track.contentHint === 'detail';
          if (isDetail) {
            // Never drop screen share below 800kbps (unreadable)
            params.encodings[0].maxBitrate = Math.max(800000, bitrate);
          } else {
            // Camera can go as low as 150kbps (still visible)
            params.encodings[0].maxBitrate = Math.max(150000, bitrate * 0.5);
          }

          await sender.setParameters(params);
        }
      }
    } catch (err) {
      console.warn('[useWebRTC] Failed to apply bitrate limit:', err);
    }
  };

  useEffect(() => {
    return () => {
      // Only close peer connections if the user has explicitly left the room.
      // When navigating to a DM (/chat/dm/:friendId) and back, the room is
      // still active — destroying connections here would break the matched chat.
      const { isInChat } = useSessionStore.getState();
      if (isInChat) {
        console.log('[useWebRTC] Component unmounting but isInChat=true — preserving peer connections');
      } else {
        console.log('[useWebRTC] Component unmounting, closing all peer connections');
        closeAllPeerConnections();
      }
    };
  }, [closeAllPeerConnections]);

  const getPeerConnection = useCallback((targetPeerId: string): RTCPeerConnection | undefined => {
    return peerConnectionsRef.current.get(targetPeerId);
  }, []);

  const getPeerConnections = useCallback((): Map<string, RTCPeerConnection> => {
    return peerConnectionsRef.current;
  }, []);

  return {
    createPeerConnection: createPeerConnectionWrapper,
    closePeerConnection,
    closeAllPeerConnections,
    initiateCall,
    requestRenegotiation,
    onDataChannel,
    getConnectionStats,
    setLocalStream,
    isDataChannelOpen,
    waitForDataChannelOpen,
    getPeerConnection,
    getPeerConnections,
    applyTurnFallback,
    isFallbackActive: (targetPeerId: string) => fallbackActiveRef.current.has(targetPeerId),
    getConnectionState: (targetPeerId: string) => peerStateRef.current.get(targetPeerId) ?? { type: 'new' },
  };
}
