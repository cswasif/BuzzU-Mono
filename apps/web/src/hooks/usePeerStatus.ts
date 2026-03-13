import { useState, useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '../stores/sessionStore';

export type PeerStatus = 'online' | 'idle' | 'offline';

export interface PeerStatusInfo {
  status: PeerStatus;
  lastSeen?: string;
  isPeerConnected: boolean;
  updateActivity: () => void;
}

const IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const HEARTBEAT_INTERVAL = 15 * 1000; // 15 seconds between heartbeats
const HEARTBEAT_TIMEOUT = 30 * 1000; // 30 seconds to receive heartbeat response

interface HeartbeatData {
  type: 'heartbeat';
  timestamp: number;
  peerId: string;
}

export function usePeerStatus(targetPeerId?: string): PeerStatusInfo {
  const [status, setStatus] = useState<PeerStatus>('offline');
  const [isPeerConnected, setIsPeerConnected] = useState(false);
  const [lastSeen, setLastSeen] = useState<string>();
  
  const lastActivityRef = useRef<number>(Date.now());
  const lastHeartbeatSentRef = useRef<number>(0);
  const lastHeartbeatReceivedRef = useRef<number>(0);
  const attachedChannelsRef = useRef<Set<RTCDataChannel>>(new Set());
  
  const partnerId = useSessionStore((state) => state.partnerId);
  const activeDmFriend = useSessionStore((state) => state.activeDmFriend);
  const selfPeerId = useSessionStore((state) => state.peerId);
  
  const effectivePeerId = targetPeerId || partnerId || activeDmFriend?.id;

  const getOpenChannel = useCallback((pc: RTCPeerConnection): RTCDataChannel | null => {
    for (const channel of attachedChannelsRef.current) {
      if (channel.readyState === 'open') return channel;
    }
    const channelMap = (pc as any).dataChannels;
    let found: RTCDataChannel | null = null;
    if (channelMap?.forEach) {
      channelMap.forEach((channel: RTCDataChannel) => {
        if (!found && channel.readyState === 'open') {
          found = channel;
          attachedChannelsRef.current.add(channel);
        }
      });
    }
    return found;
  }, []);

  const sendHeartbeat = useCallback((pc: RTCPeerConnection) => {
    if (!effectivePeerId) return;
    const heartbeatData: HeartbeatData = {
      type: 'heartbeat',
      timestamp: Date.now(),
      peerId: selfPeerId || effectivePeerId
    };

    try {
      const dataChannel = getOpenChannel(pc);
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(heartbeatData));
        lastHeartbeatSentRef.current = Date.now();
      }
    } catch (error) {
      console.error('Failed to send heartbeat:', error);
    }
  }, [effectivePeerId, selfPeerId, getOpenChannel]);

  const handleHeartbeat = useCallback((data: HeartbeatData) => {
    if (data.type === 'heartbeat') {
      lastHeartbeatReceivedRef.current = Date.now();
      lastActivityRef.current = Date.now();
      setLastSeen(new Date().toISOString());
      setIsPeerConnected(true);
      const timeSinceActivity = Date.now() - lastActivityRef.current;
      setStatus(timeSinceActivity > IDLE_TIMEOUT ? 'idle' : 'online');
    }
  }, []);

  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isPeerConnected && status !== 'online') {
      setStatus('online');
    }
  }, [isPeerConnected, status]);

  useEffect(() => {
    if (!effectivePeerId) {
      setStatus('offline');
      setIsPeerConnected(false);
      return;
    }

    const checkPeerConnection = () => {
      const peerConnections = (window as any).__peerConnections;
      if (!peerConnections || !peerConnections.has(effectivePeerId)) {
        setIsPeerConnected(false);
        setStatus('offline');
        return;
      }

      const pc = peerConnections.get(effectivePeerId) as RTCPeerConnection;
      if (!pc || pc.connectionState === 'closed' || pc.iceConnectionState === 'closed' || pc.iceConnectionState === 'disconnected') {
        setIsPeerConnected(false);
        setStatus('offline');
        return;
      }

      const isConnected = pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed';
      setIsPeerConnected(isConnected);

      if (isConnected) {
        const now = Date.now();
        const timeSinceLastHeartbeat = now - lastHeartbeatReceivedRef.current;
        const timeSinceActivity = now - lastActivityRef.current;

        if (lastHeartbeatReceivedRef.current === 0) {
          lastHeartbeatReceivedRef.current = now;
        } else if (timeSinceLastHeartbeat > HEARTBEAT_TIMEOUT) {
          setIsPeerConnected(false);
          setStatus('offline');
          return;
        }

        if (timeSinceActivity > IDLE_TIMEOUT) {
          setStatus('idle');
        } else {
          setStatus('online');
        }

        if (now - lastHeartbeatSentRef.current > HEARTBEAT_INTERVAL) {
          sendHeartbeat(pc);
        }
      } else {
        setStatus('offline');
      }
    };

    const interval = setInterval(checkPeerConnection, 3000);
    checkPeerConnection();

    return () => {
      clearInterval(interval);
    };
  }, [effectivePeerId, sendHeartbeat]);

  useEffect(() => {
    const peerConnections = (window as any).__peerConnections;
    if (!effectivePeerId || !peerConnections?.has(effectivePeerId)) return;

    const pc = peerConnections.get(effectivePeerId) as RTCPeerConnection;
    if (!pc) return;

    const handleDataChannelMessage = (event: MessageEvent) => {
      const now = Date.now();
      lastHeartbeatReceivedRef.current = now;
      lastActivityRef.current = now;
      setLastSeen(new Date().toISOString());
      setIsPeerConnected(true);
      setStatus('online');

      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') {
          handleHeartbeat(data);
        }
      } catch {
        return;
      }
    };

    const attachChannel = (channel: RTCDataChannel) => {
      if (attachedChannelsRef.current.has(channel)) return;
      channel.addEventListener('message', handleDataChannelMessage);
      attachedChannelsRef.current.add(channel);
    };

    const handleDataChannelEvent = (event: RTCDataChannelEvent) => {
      attachChannel(event.channel);
    };

    pc.addEventListener('datachannel', handleDataChannelEvent);

    const existingDataChannels = (pc as any).dataChannels;
    if (existingDataChannels?.forEach) {
      existingDataChannels.forEach((channel: RTCDataChannel) => {
        attachChannel(channel);
      });
    }

    const interval = setInterval(() => {
      const channelMap = (pc as any).dataChannels;
      if (channelMap?.forEach) {
        channelMap.forEach((channel: RTCDataChannel) => {
          attachChannel(channel);
        });
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      pc.removeEventListener('datachannel', handleDataChannelEvent);
      attachedChannelsRef.current.forEach(channel => {
        channel.removeEventListener('message', handleDataChannelMessage);
      });
      attachedChannelsRef.current.clear();
    };
  }, [effectivePeerId, handleHeartbeat]);

  return {
    status,
    isPeerConnected,
    lastSeen: status === 'offline' ? lastSeen : undefined,
    updateActivity,
  };
}
