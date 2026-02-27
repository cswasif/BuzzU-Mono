import { useState, useEffect, useCallback, useRef } from 'react';

export interface SignalingMessage {
    type: string;
    from?: string;
    to?: string;
    payload?: string;
    sdp?: string;
    candidate?: string;
    room_id?: string;
    peer_id?: string;
    peers?: string[];
    message?: string;
}

interface UseSignalingOptions {
    signalingUrl: string;
    roomId: string;
    peerId: string;
    onMessage?: (msg: SignalingMessage) => void;
    onPeerJoin?: (peerId: string) => void;
    onPeerLeave?: (peerId: string) => void;
    autoConnect?: boolean;
}

export function useSignaling(options: UseSignalingOptions) {
    const {
        signalingUrl,
        roomId,
        peerId,
        onMessage,
        onPeerJoin,
        onPeerLeave,
        autoConnect = false,
    } = options;

    const [isConnected, setIsConnected] = useState(false);
    const [peers, setPeers] = useState<string[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const callbacksRef = useRef({ onMessage, onPeerJoin, onPeerLeave });

    // Keep callbacks fresh without reconnecting
    useEffect(() => {
        callbacksRef.current = { onMessage, onPeerJoin, onPeerLeave };
    }, [onMessage, onPeerJoin, onPeerLeave]);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        try {
            const url = `${signalingUrl}/room/${roomId}/websocket?peer_id=${encodeURIComponent(peerId)}`;
            const ws = new WebSocket(url);

            ws.onopen = () => {
                setIsConnected(true);
                setError(null);
            };

            ws.onmessage = (event) => {
                try {
                    const msg: SignalingMessage = JSON.parse(event.data);

                    switch (msg.type) {
                        case 'PeerList':
                            setPeers(msg.peers || []);
                            break;
                        case 'Join':
                            if (msg.peer_id) {
                                setPeers(prev => [...new Set([...prev, msg.peer_id!])]);
                                callbacksRef.current.onPeerJoin?.(msg.peer_id);
                            }
                            break;
                        case 'Leave':
                            if (msg.peer_id) {
                                setPeers(prev => prev.filter(p => p !== msg.peer_id));
                                callbacksRef.current.onPeerLeave?.(msg.peer_id);
                            }
                            break;
                    }

                    callbacksRef.current.onMessage?.(msg);
                } catch {
                    console.warn('[useSignaling] Failed to parse message');
                }
            };

            ws.onclose = () => {
                setIsConnected(false);
                wsRef.current = null;
            };

            ws.onerror = () => {
                setError(new Error('Signaling connection failed'));
                setIsConnected(false);
            };

            wsRef.current = ws;
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        }
    }, [signalingUrl, roomId, peerId]);

    const disconnect = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        setIsConnected(false);
        setPeers([]);
    }, []);

    const sendOffer = useCallback((toPeer: string, sdp: string) => {
        wsRef.current?.send(JSON.stringify({
            type: 'Offer',
            from: peerId,
            to: toPeer,
            payload: sdp,
            room_id: roomId,
        }));
    }, [peerId, roomId]);

    const sendAnswer = useCallback((toPeer: string, sdp: string) => {
        wsRef.current?.send(JSON.stringify({
            type: 'Answer',
            from: peerId,
            to: toPeer,
            payload: sdp,
            room_id: roomId,
        }));
    }, [peerId, roomId]);

    const sendIceCandidate = useCallback((toPeer: string, candidate: string) => {
        wsRef.current?.send(JSON.stringify({
            type: 'IceCandidate',
            from: peerId,
            to: toPeer,
            payload: candidate,
            room_id: roomId,
        }));
    }, [peerId, roomId]);

    useEffect(() => {
        if (autoConnect) connect();
        return () => { wsRef.current?.close(); };
    }, [autoConnect, connect]);

    return {
        isConnected,
        peers,
        error,
        connect,
        disconnect,
        sendOffer,
        sendAnswer,
        sendIceCandidate,
    };
}
