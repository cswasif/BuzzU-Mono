import { useState, useCallback, useRef, useEffect } from 'react';

export interface MatchResult {
    roomId: string;
    peerId: string;
    partnerId: string;
}

interface UseMatchingOptions {
    matchmakerUrl: string;
    peerId: string;
    onMatch?: (result: MatchResult) => void;
    onWaiting?: (position: number) => void;
    onError?: (error: string) => void;
}

export function useMatching(options: UseMatchingOptions) {
    const { matchmakerUrl, peerId, onMatch, onWaiting, onError } = options;

    const [isSearching, setIsSearching] = useState(false);
    const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
    const [waitPosition, setWaitPosition] = useState<number | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const callbacksRef = useRef({ onMatch, onWaiting, onError });

    useEffect(() => {
        callbacksRef.current = { onMatch, onWaiting, onError };
    }, [onMatch, onWaiting, onError]);

    const findMatch = useCallback((interests: string[] = [], gender = 'U', filter = 'both') => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        setIsSearching(true);
        setMatchResult(null);
        setWaitPosition(null);

        try {
            const url = `${matchmakerUrl}/match?peer_id=${encodeURIComponent(peerId)}`;
            const ws = new WebSocket(url);

            ws.onopen = () => {
                // Send search message matching MatchMessage::Search format
                ws.send(JSON.stringify({
                    type: 'Search',
                    interests,
                    gender,
                    filter,
                }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    switch (msg.type) {
                        case 'Match': {
                            const result: MatchResult = {
                                roomId: msg.room_id,
                                peerId: msg.peer_id,
                                partnerId: msg.partner_id,
                            };
                            setMatchResult(result);
                            setIsSearching(false);
                            callbacksRef.current.onMatch?.(result);
                            break;
                        }
                        case 'Waiting':
                            setWaitPosition(msg.position);
                            callbacksRef.current.onWaiting?.(msg.position);
                            break;
                        case 'Error':
                            callbacksRef.current.onError?.(msg.message);
                            setIsSearching(false);
                            break;
                    }
                } catch {
                    console.warn('[useMatching] Failed to parse message');
                }
            };

            ws.onclose = () => {
                // Match found closes the WS — only set searching false if no match
                if (!matchResult) {
                    setIsSearching(false);
                }
            };

            ws.onerror = () => {
                callbacksRef.current.onError?.('Connection to matchmaker failed');
                setIsSearching(false);
            };

            wsRef.current = ws;
        } catch (err) {
            setIsSearching(false);
            callbacksRef.current.onError?.(String(err));
        }
    }, [matchmakerUrl, peerId, matchResult]);

    const cancelSearch = useCallback(() => {
        wsRef.current?.close();
        wsRef.current = null;
        setIsSearching(false);
        setWaitPosition(null);
    }, []);

    useEffect(() => {
        return () => { wsRef.current?.close(); };
    }, []);

    return {
        isSearching,
        matchResult,
        waitPosition,
        findMatch,
        cancelSearch,
    };
}
