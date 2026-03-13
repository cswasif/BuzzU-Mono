import { useMemo } from 'react';
import { useOptimalStun } from './useOptimalStun';

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'blocked';

export interface LobbyProbeResult {
    quality: NetworkQuality;
    rtt: number | null;
    isUdpBlocked: boolean;
    warnings: string[];
    isProbing: boolean;
}

/**
 * useLobbyProbe — Provides a user-facing assessment of network readiness.
 * 
 * Leveraging the results from useOptimalStun (which probes on page load),
 * this hook translates raw RTTs and reliability scores into human-readable
 * quality grades and warnings.
 */
export function useLobbyProbe(): LobbyProbeResult {
    const { ranking, isProbing } = useOptimalStun();

    return useMemo(() => {
        // While probing the first time, assume neutral state
        if (isProbing && ranking.length === 0) {
            return { quality: 'good', rtt: null, isUdpBlocked: false, warnings: [], isProbing: true };
        }

        const responded = ranking.filter(r => r.probe_count > 0 && r.reliability > 0);

        // If we have ranking items but ZERO responded, UDP (STUN) is likely blocked by a firewall
        const isUdpBlocked = ranking.length > 0 && responded.length === 0;

        if (isUdpBlocked) {
            return {
                quality: 'blocked',
                rtt: null,
                isUdpBlocked: true,
                warnings: ['UDP is blocked on your network. Video calls will fall back to slower RELAY (TURN) servers.'],
                isProbing,
            };
        }

        // Find the best RTT from our optimal servers
        const bestRtt = responded.length > 0 ? Math.min(...responded.map(r => r.median_rtt_ms)) : null;

        let quality: NetworkQuality = 'excellent';
        const warnings: string[] = [];

        if (bestRtt === null) {
            quality = 'poor';
            if (ranking.length > 0) {
                warnings.push('Network probe failed. Your connection might be unstable.');
            }
        } else if (bestRtt > 500) {
            quality = 'poor';
            warnings.push('Very high latency detected. Expect significant lag.');
        } else if (bestRtt > 250) {
            quality = 'fair';
            warnings.push('Moderate latency. Video might be slightly delayed.');
        } else if (bestRtt > 120) {
            quality = 'good';
        } else {
            quality = 'excellent';
        }

        return { quality, rtt: bestRtt, isUdpBlocked, warnings, isProbing };
    }, [ranking, isProbing]);
}
