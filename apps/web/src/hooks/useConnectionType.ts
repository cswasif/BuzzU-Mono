import { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../stores/sessionStore';

export type ConnectionType = 'direct' | 'turn' | 'relay' | 'unknown';

export interface ConnectionInfo {
  type: ConnectionType;
  protocol: 'udp' | 'tcp';
  localCandidateType: string;
  remoteCandidateType: string;
  rtt?: number;
  isRelayed: boolean;
}

export function useConnectionType() {
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    type: 'unknown',
    protocol: 'udp',
    localCandidateType: '',
    remoteCandidateType: '',
    isRelayed: false,
  });
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const partnerId = useSessionStore((state) => state.partnerId);
  const activeDmFriend = useSessionStore((state) => state.activeDmFriend);
  
  const targetId = partnerId || activeDmFriend?.id;

  useEffect(() => {
    if (!targetId) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setConnectionInfo({
        type: 'unknown',
        protocol: 'udp',
        localCandidateType: '',
        remoteCandidateType: '',
        isRelayed: false,
      });
      return;
    }

    const checkConnectionType = async () => {
      try {
        // Access the peer connection from the global WebRTC manager
        const peerConnections = (window as any).__peerConnections;
        if (!peerConnections || !peerConnections.has(targetId)) {
          return;
        }

        const pc = peerConnections.get(targetId) as RTCPeerConnection;
        if (!pc || pc.connectionState === 'closed') {
          return;
        }

        const stats = await pc.getStats();
        let candidatePair: any = null;
        let localCandidate: any = null;
        let remoteCandidate: any = null;

        stats.forEach((report: any) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            candidatePair = report;
          }
        });

        if (candidatePair) {
          stats.forEach((report: any) => {
            if (report.id === candidatePair.localCandidateId) {
              localCandidate = report;
            }
            if (report.id === candidatePair.remoteCandidateId) {
              remoteCandidate = report;
            }
          });
        }

        if (localCandidate) {
          const localType = localCandidate.candidateType?.toLowerCase() || '';
          const remoteType = remoteCandidate?.candidateType?.toLowerCase() || '';
          const protocol = localCandidate.protocol?.toLowerCase() || 'udp';
          
          // Determine connection type
          let type: ConnectionType = 'unknown';
          let isRelayed = false;

          if (localType === 'host' && remoteType === 'host') {
            type = 'direct'; // Direct P2P (STUN)
          } else if (localType === 'relay' || remoteType === 'relay') {
            type = 'turn';
            isRelayed = true;
          } else if (localType === 'srflx' || remoteType === 'srflx') {
            type = 'direct'; // STUN NAT traversal
          } else if (localType === 'prflx' || remoteType === 'prflx') {
            type = 'direct'; // Peer reflexive
          }

          setConnectionInfo({
            type,
            protocol: protocol as 'udp' | 'tcp',
            localCandidateType: localType,
            remoteCandidateType: remoteType,
            rtt: candidatePair?.currentRoundTripTime ? candidatePair.currentRoundTripTime * 1000 : undefined,
            isRelayed,
          });
        }
      } catch (error) {
        console.warn('[useConnectionType] Error checking connection type:', error);
      }
    };

    // Check immediately
    checkConnectionType();

    // Then check every 3 seconds
    intervalRef.current = setInterval(checkConnectionType, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [targetId]);

  return connectionInfo;
}