import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOptimalStun, FALLBACK_STUN_SERVERS } from './useOptimalStun';

const SIGNALING_URL = process.env.SIGNALING_URL || import.meta.env.VITE_SIGNALING_URL || 'wss://buzzu-signaling.buzzu.workers.dev';
const SIGNAL_BASE_URL = SIGNALING_URL.replace(/^ws(s)?:\/\//, 'http$1://');

const randomFloat = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const buffer = new Uint32Array(1);
        crypto.getRandomValues(buffer);
        return buffer[0] / 0xffffffff;
    }
    return Math.random();
};

const computeBackoffMs = (attempt: number, maxMs: number) => {
    const base = Math.min(1000 * Math.pow(2, attempt), maxMs);
    const jitter = 0.7 + randomFloat() * 0.6;
    return Math.round(base * jitter);
};

const logEvent = (level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>) => {
    const payload = { level, event, ts: Date.now(), ...data };
    if (level === 'error') {
        console.error(JSON.stringify(payload));
    } else if (level === 'warn') {
        console.warn(JSON.stringify(payload));
    } else {
        console.log(JSON.stringify(payload));
    }
};

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

export interface RTCIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
}

/**
 * Provides the best ICE servers for WebRTC peer connections.
 *
 * STUN servers are ranked by the Rust WASM StunProber — it probes all
 * candidate servers on page load, measures RTT/jitter/reliability, and
 * returns only the top 3 fastest. This cuts ICE gathering time by ~60%
 * compared to handing all 7 static servers to the browser.
 *
 * TURN servers are fetched from the signaling worker (Cloudflare TURN).
 */
export function useIceServers() {
    const { optimalServers, isProbing, ranking } = useOptimalStun();
    const [turnServers, setTurnServers] = useState<RTCIceServer[]>([]);
    const [loading, setLoading] = useState(true);

    // Use probed optimal servers, fallback to first 3 static while probing
    const stunServers = optimalServers.length > 0 ? optimalServers : FALLBACK_STUN_SERVERS;

    const fetchTurnServers = useCallback(async () => {
        try {
            const maxAttempts = 4;
            for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                try {
                    const response = await fetchWithTimeout(`${SIGNAL_BASE_URL}/ice-servers`, 4000);
                    if (!response.ok) throw new Error(`Failed to fetch TURN servers: ${response.status}`);
                    const data = await response.json();
                    if (data.iceServers) {
                        const cloudflareServers = data.iceServers as RTCIceServer[];
                        setTurnServers(cloudflareServers);
                    }
                    return;
                } catch (err) {
                    if (attempt === maxAttempts - 1) throw err;
                    const delayMs = computeBackoffMs(attempt + 1, 8000);
                    logEvent('warn', 'turn_fetch_retry', {
                        attempt: attempt + 1,
                        delayMs,
                        error: err instanceof Error ? err.message : String(err),
                    });
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        } catch (err) {
            console.error('[useIceServers] Error fetching TURN servers:', err);
            logEvent('error', 'turn_fetch_failed', {
                error: err instanceof Error ? err.message : String(err),
            });
            setTurnServers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchTurnServers();
    }, [fetchTurnServers]);

    // Log ranking when probing completes
    useEffect(() => {
        if (!isProbing && ranking.length > 0) {
            console.log('[useIceServers] Using optimal STUN servers:',
                stunServers.map(s => s.urls));
            console.log('[useIceServers] Full ranking:', ranking.map(r =>
                `${r.url} → ${r.median_rtt_ms.toFixed(1)}ms (score: ${r.score.toFixed(1)})`
            ));
        }
    }, [isProbing, ranking, stunServers]);

    // Memoize to avoid creating a new array on every render
    const allServers = useMemo(() => [...stunServers, ...turnServers], [stunServers, turnServers]);

    return {
        stunServers,
        turnServers,
        allServers,
        loading: loading || isProbing,
        refresh: fetchTurnServers
    };
}
