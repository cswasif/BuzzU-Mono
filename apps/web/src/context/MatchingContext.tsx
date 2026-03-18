import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { sendMatchmakerDisconnect, useSessionStore } from "../stores/sessionStore";

const MATCHMAKER_URL =
    process.env.MATCHMAKER_URL ||
    import.meta.env.VITE_MATCHMAKER_URL ||
    "wss://buzzu-matchmaker.cswasif.workers.dev";
const MATCHMAKER_HTTP_URL = MATCHMAKER_URL.replace(/^ws/i, "http");
const PRESENCE_SNAPSHOT_MIN_INTERVAL_MS = 60000;

const sanitizeRoutingPartition = (value: string) => {
    const normalized = value
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    if (!normalized) return "global";
    return normalized.slice(0, 32);
};

export const buildMatchmakerWsUrl = (params: {
    baseUrl: string;
    peerId: string;
    chatMode: string;
    selectedInstitution: string;
}) => {
    const query = new URLSearchParams({
        peer_id: params.peerId,
        chat_mode: sanitizeRoutingPartition(params.chatMode || "text"),
        region: sanitizeRoutingPartition(params.selectedInstitution || "global"),
    });
    return `${params.baseUrl}/match?${query.toString()}`;
};

export const buildMatchmakerSearchMessage = (params: {
    interests: string[];
    matchWithInterests: boolean;
    interestTimeoutSec: number;
    gender: string;
    genderFilter: string;
    isVerified: boolean;
    verifiedOnly: boolean;
    chatMode: string;
    deviceId: string;
    tabId: string;
    blockedPeerIds: string[];
}) => ({
    type: "Search" as const,
    interests: params.matchWithInterests ? params.interests : [],
    with_interests: params.matchWithInterests,
    interest_timeout: Math.max(0, Math.min(600, Math.round(params.interestTimeoutSec))),
    gender: params.gender,
    filter: params.genderFilter,
    is_verified: params.isVerified,
    verified_only: params.verifiedOnly,
    chat_mode: params.chatMode,
    device_id: params.deviceId,
    tab_id: params.tabId,
    blocked_peer_ids: params.blockedPeerIds,
});

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

const primeMatchmakerSession = async (peerId: string) => {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), 3000);
    const fetchPromise = fetch(
        `${MATCHMAKER_HTTP_URL}/users/me?peer_id=${encodeURIComponent(peerId)}`,
        {
            method: "GET",
            credentials: "include",
            signal: controller?.signal,
        },
    )
        .catch(() => undefined)
        .finally(() => {
            clearTimeout(timeout);
        });

    await Promise.race([
        fetchPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 3200)),
    ]);
};

export const shouldSuppressAudioPlayError = (err: unknown): boolean => {
    const name = (err as { name?: string } | null | undefined)?.name;
    const message = err instanceof Error ? err.message : String(err ?? "");
    return (
        name === "NotAllowedError" ||
        name === "AbortError" ||
        message.includes("The play() request was interrupted")
    );
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
    textActiveUsers: number;
    videoActiveUsers: number;
    startMatching: (force?: boolean) => void;
    stopMatching: (cancelQueue?: boolean) => void;
}

const MatchingContext = createContext<MatchingContextType | undefined>(undefined);

export const MatchingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isMatching, setIsMatching] = useState(false);
    const [matchData, setMatchData] = useState<MatchData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [waitPosition, setWaitPosition] = useState<number | null>(null);
    const [textActiveUsers, setTextActiveUsers] = useState(0);
    const [videoActiveUsers, setVideoActiveUsers] = useState(0);

    const wsRef = useRef<WebSocket | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMatchingRef = useRef(false);
    const matchDataRef = useRef<MatchData | null>(null);
    const lastMessageAtRef = useRef<number | null>(null);
    const retryCountRef = useRef(0);
    const watchdogRef = useRef<NodeJS.Timeout | null>(null);
    const consecutiveFailuresRef = useRef(0);
    const userInitiatedStopRef = useRef(false);
    const retryTimersRef = useRef<Set<NodeJS.Timeout>>(new Set());
    const userStopResetTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastPresenceSnapshotAtRef = useRef(0);
    const wsSessionRef = useRef(0);

    const {
        peerId,
        deviceId,
        tabId,
        interests,
        matchWithInterests,
        interestTimeoutSec,
        gender,
        genderFilter,
        isVerified,
        verifiedOnly,
        chatMode,
        selectedInstitution,
        joinRoom,
        notificationSoundEnabled,
        isUserBlocked,
        blockedUsers,
    } = useSessionStore();

    const scheduleManagedTimeout = useCallback((task: () => void, delayMs: number) => {
        const timer = setTimeout(() => {
            retryTimersRef.current.delete(timer);
            task();
        }, delayMs);
        retryTimersRef.current.add(timer);
    }, []);

    const clearManagedTimeouts = useCallback(() => {
        for (const timer of retryTimersRef.current) {
            clearTimeout(timer);
        }
        retryTimersRef.current.clear();
    }, []);

    const stopMatchingInternal = useCallback(
        async (cancelQueue: boolean, updateState: boolean) => {
            console.log("[MatchingProvider] stopMatching, cancelQueue:", cancelQueue);
            isMatchingRef.current = false;
            wsSessionRef.current += 1;
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
            clearManagedTimeouts();
            if (userStopResetTimerRef.current) {
                clearTimeout(userStopResetTimerRef.current);
                userStopResetTimerRef.current = null;
            }

            if (updateState) {
                setIsMatching(false);
                setError(null);
            }

            if (cancelQueue && peerId) {
                sendMatchmakerDisconnect(peerId);
            }
        },
        [peerId, clearManagedTimeouts],
    );

    const stopMatching = useCallback(
        async (cancelQueue: boolean = true) => {
            userInitiatedStopRef.current = true;
            await stopMatchingInternal(cancelQueue, true);
            if (userStopResetTimerRef.current) {
                clearTimeout(userStopResetTimerRef.current);
            }
            userStopResetTimerRef.current = setTimeout(() => {
                userInitiatedStopRef.current = false;
            }, 1000);
        },
        [stopMatchingInternal],
    );

    const createSearchMessage = useCallback(() => {
        const latestBlocked = useSessionStore.getState().blockedUsers.map((user) => user.id);
        return buildMatchmakerSearchMessage({
            interests,
            matchWithInterests,
            interestTimeoutSec,
            gender,
            genderFilter,
            isVerified,
            verifiedOnly,
            chatMode,
            deviceId,
            tabId,
            blockedPeerIds: latestBlocked,
        });
    }, [interests, matchWithInterests, interestTimeoutSec, gender, genderFilter, isVerified, verifiedOnly, chatMode, deviceId, tabId]);

    const refreshPresenceSnapshot = useCallback(async (options?: { force?: boolean }) => {
        if (!peerId) return;
        if (!options?.force && isMatchingRef.current) return;
        const now = Date.now();
        if (!options?.force && now - lastPresenceSnapshotAtRef.current < PRESENCE_SNAPSHOT_MIN_INTERVAL_MS) {
            return;
        }
        try {
            const params = new URLSearchParams({
                peer_id: peerId,
                chat_mode: sanitizeRoutingPartition(chatMode || "text"),
                region: sanitizeRoutingPartition(selectedInstitution || "global"),
            });
            const response = await fetch(`${MATCHMAKER_HTTP_URL}/metrics?${params.toString()}`, {
                method: "GET",
                credentials: "include",
            });
            if (!response.ok) return;
            const payload = await response.json() as {
                activeByMode?: { text?: number; video?: number };
            };
            const text = payload?.activeByMode?.text;
            const video = payload?.activeByMode?.video;
            if (typeof text === "number") {
                setTextActiveUsers(text);
            }
            if (typeof video === "number") {
                setVideoActiveUsers(video);
            }
            lastPresenceSnapshotAtRef.current = Date.now();
        } catch {
        }
    }, [peerId, chatMode, selectedInstitution]);

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
        const wsSession = wsSessionRef.current + 1;
        wsSessionRef.current = wsSession;
        isMatchingRef.current = true;
        userInitiatedStopRef.current = false;
        setError(null);
        setMatchData(null);
        matchDataRef.current = null;
        setWaitPosition(null);
        setIsMatching(true);
        clearManagedTimeouts();

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
            const attachSocketHandlers = (ws: WebSocket, session: number) => {
                ws.onopen = () => {
                    if (wsRef.current !== ws || wsSessionRef.current !== session) return;
                    console.log("[MatchingProvider] Connected to matchmaker");
                    logEvent("info", "matchmaker_connected", { peerId });
                    lastMessageAtRef.current = Date.now();
                    retryCountRef.current = 0;

                    ws.send(JSON.stringify(createSearchMessage()));

                    const tick = () => {
                        if (!isMatchingRef.current || wsRef.current !== ws) return;
                        const now = Date.now();
                        const lastMessageAt = lastMessageAtRef.current ?? now;
                        if (now - lastMessageAt > 30000) {
                            retryCountRef.current += 1;
                            if (retryCountRef.current <= 4) {
                                ws.send(JSON.stringify(createSearchMessage()));
                                lastMessageAtRef.current = now;
                            } else {
                                logEvent("warn", "matchmaker_watchdog_timeout", {
                                    peerId,
                                    retryCount: retryCountRef.current,
                                });
                                stopMatchingInternal(true, true);
                                const restartDelay = computeBackoffMs(consecutiveFailuresRef.current, 16000);
                                consecutiveFailuresRef.current += 1;
                                scheduleManagedTimeout(() => {
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
                if (wsRef.current !== ws || wsSessionRef.current !== session) return;
                try {
                    const message = JSON.parse(event.data);
                    lastMessageAtRef.current = Date.now();
                    retryCountRef.current = 0;
                    consecutiveFailuresRef.current = 0;

                    switch (message.type) {
                        case "Match":
                            if (isUserBlocked(message.partner_id)) {
                                sendMatchmakerDisconnect(peerId, { useBeacon: true });
                                scheduleManagedTimeout(() => {
                                    if (!userInitiatedStopRef.current && isMatchingRef.current && ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify(createSearchMessage()));
                                    }
                                }, 120);
                                break;
                            }
                            if (
                                matchDataRef.current &&
                                matchDataRef.current.room_id === message.room_id &&
                                matchDataRef.current.partner_id === message.partner_id
                            ) {
                                break;
                            }
                            if (notificationSoundEnabled) {
                                try {
                                    const audio = new Audio('/sounds/matched.mp3');
                                    audio.play().catch(e => {
                                        if (!shouldSuppressAudioPlayError(e)) {
                                            console.warn('Audio play failed:', e);
                                        }
                                    });
                                } catch (e) {
                                }
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
                        case "Presence":
                            setTextActiveUsers(typeof message.text_active === "number" ? message.text_active : 0);
                            setVideoActiveUsers(typeof message.video_active === "number" ? message.video_active : 0);
                            lastPresenceSnapshotAtRef.current = Date.now();
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
                if (wsRef.current !== ws || wsSessionRef.current !== session) return;
                if (!userInitiatedStopRef.current) {
                    consecutiveFailuresRef.current += 1;
                    const backoffMs = computeBackoffMs(consecutiveFailuresRef.current, 30000);
                    logEvent("warn", "matchmaker_ws_error", {
                        peerId,
                        consecutiveFailures: consecutiveFailuresRef.current,
                        backoffMs,
                    });
                    setError("Connection failed - retrying...");
                    if (wsRef.current === ws) {
                        wsRef.current = null;
                    }
                    if (consecutiveFailuresRef.current <= 5) {
                        scheduleManagedTimeout(() => {
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
                if (wsSessionRef.current !== session) return;
                const wasMatching = isMatchingRef.current;
                const hasMatchData = matchDataRef.current !== null;
                const wasUserStop = userInitiatedStopRef.current;
                isMatchingRef.current = false;
                if (wsRef.current === ws) {
                    wsRef.current = null;
                }

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
                        scheduleManagedTimeout(() => {
                            if (!userInitiatedStopRef.current && matchDataRef.current === null) {
                                startMatching();
                            }
                        }, backoffMs);
                    }
                }
                };
            };

            const connectWebSocket = async () => {
                await primeMatchmakerSession(peerId);
                if (!isMatchingRef.current || wsRef.current !== null) {
                    return;
                }
                const wsUrl = buildMatchmakerWsUrl({
                    baseUrl: MATCHMAKER_URL,
                    peerId,
                    chatMode,
                    selectedInstitution,
                });
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;
                attachSocketHandlers(ws, wsSession);
            };

            void connectWebSocket();
        } catch (err) {
            isMatchingRef.current = false;
            setError("Failed to connect");
            setIsMatching(false);
        }
    }, [peerId, chatMode, selectedInstitution, joinRoom, isUserBlocked, stopMatching, stopMatchingInternal, createSearchMessage, scheduleManagedTimeout, clearManagedTimeouts, notificationSoundEnabled]);

    useEffect(() => {
        if (!isMatching) return;
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify(createSearchMessage()));
    }, [blockedUsers, isMatching, createSearchMessage]);

    useEffect(() => {
        if (typeof document === "undefined") return;
        if (document.visibilityState !== "visible") return;
        void refreshPresenceSnapshot({ force: true });
    }, [refreshPresenceSnapshot, peerId, chatMode, selectedInstitution]);

    useEffect(() => {
        if (isMatching) return;
        const tick = () => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            void refreshPresenceSnapshot();
        };
        const timer = setInterval(tick, PRESENCE_SNAPSHOT_MIN_INTERVAL_MS);
        return () => clearInterval(timer);
    }, [isMatching, refreshPresenceSnapshot]);

    useEffect(() => {
        if (typeof document === "undefined") return;
        const onVisibilityChange = () => {
            if (document.visibilityState !== "visible") return;
            void refreshPresenceSnapshot({ force: true });
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }, [refreshPresenceSnapshot]);

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
                textActiveUsers,
                videoActiveUsers,
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
