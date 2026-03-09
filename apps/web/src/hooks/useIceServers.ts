import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOptimalStun, FALLBACK_STUN_SERVERS } from './useOptimalStun';

const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'wss://buzzu-signaling.md-wasif-faisal.workers.dev';
const SIGNAL_BASE_URL = SIGNALING_URL.replace(/^ws(s)?:\/\//, 'http$1://');

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
            const response = await fetch(`${SIGNAL_BASE_URL}/ice-servers`);
            if (!response.ok) throw new Error('Failed to fetch TURN servers');

            const data = await response.json();
            if (data.iceServers) {
                const cloudflareServers = data.iceServers as RTCIceServer[];
                setTurnServers(cloudflareServers);
            }
        } catch (err) {
            console.error('[useIceServers] Error fetching TURN servers:', err);
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
