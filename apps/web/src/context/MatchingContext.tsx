import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { sendMatchmakerDisconnect, useSessionStore } from "../stores/sessionStore";

const MATCHMAKER_URL =
    import.meta.env.VITE_MATCHMAKER_URL ||
    "wss://buzzu-matchmaker.md-wasif-faisal.workers.dev";

const randomFloat = () => {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
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

const logEvent = (level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) => {
    const payload = { level, event, ts: Date.now(), ...data };
    if (level === "error") {
        console.error(JSON.stringify(payload));
    } else if (level === "warn") {
        console.warn(JSON.stringify(payload));
    } else {
        console.log(JSON.stringify(payload));
    }
};

interface MatchData {
    room_id: string;
    peer_id: string;
    partner_id: string;
    partner_is_verified: boolean;
    partner_avatar_seed?: string;
    partner_avatar_url?: string | null;
}

interface MatchingContextType {
    isMatching: boolean;
    matchData: MatchData | null;
    setMatchData: (data: MatchData | null) => void;
    error: string | null;
    waitPosition: number | null;
    startMatching: (force?: boolean) => void;
    stopMatching: (cancelQueue?: boolean) => void;
}

const MatchingContext = createContext<MatchingContextType | undefined>(undefined);

export const MatchingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isMatching, setIsMatching] = useState(false);
    const [matchData, setMatchData] = useState<MatchData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [waitPosition, setWaitPosition] = useState<number | null>(null);

    const wsRef = useRef<WebSocket | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMatchingRef = useRef(false);
    const matchDataRef = useRef<MatchData | null>(null);
    const lastMessageAtRef = useRef<number | null>(null);
    const retryCountRef = useRef(0);
    const watchdogRef = useRef<NodeJS.Timeout | null>(null);
    const consecutiveFailuresRef = useRef(0);
    const userInitiatedStopRef = useRef(false);

    const {
        peerId,
        deviceId,
        tabId,
        interests,
        gender,
        genderFilter,
        isVerified,
        verifiedOnly,
        chatMode,
        joinRoom,
    } = useSessionStore();

    const stopMatchingInternal = useCallback(
        async (cancelQueue: boolean, updateState: boolean) => {
            console.log("[MatchingProvider] stopMatching, cancelQueue:", cancelQueue);
            isMatchingRef.current = false;
            retryCountRef.current = 0;
            lastMessageAtRef.current = null;

            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.onerror = null;
                wsRef.current.close(1000, "User cancelled");
                wsRef.current = null;
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
            }
            if (watchdogRef.current) {
                clearTimeout(watchdogRef.current);
                watchdogRef.current = null;
            }

            if (updateState) {
                setIsMatching(false);
                setError(null);
            }

            if (cancelQueue && peerId) {
                sendMatchmakerDisconnect(peerId);
            }
        },
        [peerId],
    );

    const stopMatching = useCallback(
        async (cancelQueue: boolean = true) => {
            userInitiatedStopRef.current = true;
            await stopMatchingInternal(cancelQueue, true);
            setTimeout(() => {
                userInitiatedStopRef.current = false;
            }, 1000);
        },
        [stopMatchingInternal],
    );

    const startMatching = useCallback((force: boolean = false) => {
        if (!force && isMatchingRef.current) {
            console.log("[MatchingProvider] Already matching.");
            return;
        }
        if (!peerId) {
            console.log("[MatchingProvider] No peerId, cannot start matching.");
            return;
        }

        console.log("[MatchingProvider] startMatching, force:", force);
        isMatchingRef.current = true;
        userInitiatedStopRef.current = false;
        setError(null);
        setMatchData(null);
        matchDataRef.current = null;
        setWaitPosition(null);
        setIsMatching(true);

        if (wsRef.current) {
            console.log("[MatchingProvider] Closing existing WebSocket for restart");
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            try {
                wsRef.current.close(1000, "Forced restart");
            } catch (e) {
                console.warn("[MatchingProvider] Error closing WS:", e);
            }
            wsRef.current = null;
        }

        try {
            const wsUrl = `${MATCHMAKER_URL}/match?peer_id=${peerId}`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.log("[MatchingProvider] Connected to matchmaker");
                logEvent("info", "matchmaker_connected", { peerId });
                lastMessageAtRef.current = Date.now();
                retryCountRef.current = 0;

                const searchMessage = {
                    type: "Search",
                    interests,
                    gender,
                    filter: genderFilter,
                    is_verified: isVerified,
                    verified_only: verifiedOnly,
                    chat_mode: chatMode, // ← Isolates text vs video matchmaking queues
                    device_id: deviceId,
                    tab_id: tabId,
                };

                ws.send(JSON.stringify(searchMessage));

                const tick = () => {
                    if (!isMatchingRef.current || wsRef.current !== ws) return;
                    const now = Date.now();
                    const lastMessageAt = lastMessageAtRef.current ?? now;
                    if (now - lastMessageAt > 30000) {
                        retryCountRef.current += 1;
                        if (retryCountRef.current <= 4) {
                            ws.send(JSON.stringify(searchMessage));
                            lastMessageAtRef.current = now;
                        } else {
                            logEvent("warn", "matchmaker_watchdog_timeout", {
                                peerId,
                                retryCount: retryCountRef.current,
                            });
                            stopMatchingInternal(true, true);
                            const restartDelay = computeBackoffMs(consecutiveFailuresRef.current, 16000);
                            consecutiveFailuresRef.current += 1;
                            setTimeout(() => {
                                startMatching();
                            }, restartDelay);
                            return;
                        }
                    }
                    watchdogRef.current = setTimeout(tick, 5000);
                };
                if (watchdogRef.current) clearTimeout(watchdogRef.current);
                watchdogRef.current = setTimeout(tick, 5000);
            };

            ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    lastMessageAtRef.current = Date.now();
                    retryCountRef.current = 0;
                    consecutiveFailuresRef.current = 0;

                    switch (message.type) {
                        case "Match":
                            try {
                                const audio = new Audio('/sounds/matched.mp3');
                                audio.play().catch(e => console.warn('Audio play failed:', e));
                            } catch (e) {
                                // Ignore audio errors
                            }
                            setMatchData({
                                room_id: message.room_id,
                                peer_id: message.peer_id,
                                partner_id: message.partner_id,
                                partner_is_verified: message.partner_is_verified || false,
                                partner_avatar_seed: message.partner_avatar_seed,
                                partner_avatar_url: message.partner_avatar_url,
                            });
                            matchDataRef.current = message;
                            joinRoom(
                                message.room_id,
                                message.partner_id,
                                message.partner_is_verified || false,
                                message.partner_name,
                                message.partner_avatar_seed,
                                message.partner_avatar_url
                            );
                            setIsMatching(false);
                            stopMatching(false);
                            break;
                        case "Waiting":
                            setWaitPosition(message.position);
                            break;
                        case "Error":
                            setError(message.message);
                            logEvent("error", "matchmaker_error", {
                                peerId,
                                message: message.message,
                            });
                            setIsMatching(false);
                            stopMatching();
                            break;
                    }
                } catch (err) {
                    console.error("[MatchingProvider] Message parse error", err);
                    logEvent("error", "matchmaker_message_parse_error", {
                        peerId,
                        error: err instanceof Error ? err.message : String(err),
                    });
                }
            };

            ws.onerror = () => {
                if (!userInitiatedStopRef.current) {
                    consecutiveFailuresRef.current += 1;
                    const backoffMs = computeBackoffMs(consecutiveFailuresRef.current, 30000);
                    logEvent("warn", "matchmaker_ws_error", {
                        peerId,
                        consecutiveFailures: consecutiveFailuresRef.current,
                        backoffMs,
                    });
                    setError("Connection failed - retrying...");
                    wsRef.current = null;
                    if (consecutiveFailuresRef.current <= 5) {
                        setTimeout(() => {
                            if (!userInitiatedStopRef.current && matchDataRef.current === null) {
                                startMatching();
                            }
                        }, backoffMs);
                    } else {
                        isMatchingRef.current = false;
                        setError("Connection failed after multiple retries");
                        setIsMatching(false);
                    }
                }
            };

            ws.onclose = (event) => {
                const wasMatching = isMatchingRef.current;
                const hasMatchData = matchDataRef.current !== null;
                const wasUserStop = userInitiatedStopRef.current;
                isMatchingRef.current = false;
                wsRef.current = null;

                if (event.code === 1000) return;

                if (!wasUserStop && wasMatching && !hasMatchData) {
                    consecutiveFailuresRef.current += 1;
                    const backoffMs = computeBackoffMs(consecutiveFailuresRef.current, 30000);
                    logEvent("warn", "matchmaker_ws_close", {
                        peerId,
                        code: event.code,
                        reason: event.reason,
                        consecutiveFailures: consecutiveFailuresRef.current,
                        backoffMs,
                    });
                    if (consecutiveFailuresRef.current <= 5) {
                        setTimeout(() => {
                            if (!userInitiatedStopRef.current && matchDataRef.current === null) {
                                startMatching();
                            }
                        }, backoffMs);
                    }
                }
            };
        } catch (err) {
            isMatchingRef.current = false;
            setError("Failed to connect");
            setIsMatching(false);
        }
    }, [peerId, interests, gender, genderFilter, isVerified, verifiedOnly, joinRoom, stopMatching, stopMatchingInternal]);

    useEffect(() => {
        return () => {
            stopMatchingInternal(true, false);
        };
    }, [stopMatchingInternal]);

    return (
        <MatchingContext.Provider
            value={{
                isMatching,
                matchData,
                setMatchData,
                error,
                waitPosition,
                startMatching,
                stopMatching,
            }}
        >
            {children}
        </MatchingContext.Provider>
    );
};

export const useMatchingContext = () => {
    const context = useContext(MatchingContext);
    if (context === undefined) {
        throw new Error("useMatchingContext must be used within a MatchingProvider");
    }
    return context;
};
