import { useState, useCallback, useRef, useEffect } from "react";
import { useSessionStore } from "../stores/sessionStore";

const MATCHMAKER_URL =
  import.meta.env.VITE_MATCHMAKER_URL ||
  "wss://buzzu-matchmaker.md-wasif-faisal.workers.dev";

interface MatchData {
  room_id: string;
  peer_id: string;
  partner_id: string;
  partner_is_verified: boolean;
}

interface UseMatchingResult {
  isMatching: boolean;
  matchData: MatchData | null;
  setMatchData: (data: MatchData | null) => void;
  error: string | null;
  waitPosition: number | null;
  startMatching: () => void;
  stopMatching: (cancelQueue?: boolean) => void;
}

export function useMatching(): UseMatchingResult {
  const [isMatching, setIsMatching] = useState(false);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [waitPosition, setWaitPosition] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMatchingRef = useRef(false);
  const isMountedRef = useRef(true);
  const matchDataRef = useRef<MatchData | null>(null);
  const lastMessageAtRef = useRef<number | null>(null);
  const retryCountRef = useRef(0);
  const watchdogRef = useRef<NodeJS.Timeout | null>(null);
  const consecutiveFailuresRef = useRef(0);
  const userInitiatedStopRef = useRef(false);

  const {
    peerId,
    interests,
    gender,
    genderFilter,
    isVerified,
    verifiedOnly,
    joinRoom,
    avatarSeed,
  } = useSessionStore();

  const safeSetIsMatching = useCallback((value: boolean) => {
    if (isMountedRef.current) setIsMatching(value);
  }, []);
  const safeSetMatchData = useCallback((value: MatchData | null) => {
    matchDataRef.current = value;
    if (isMountedRef.current) setMatchData(value);
  }, []);
  const safeSetError = useCallback((value: string | null) => {
    if (isMountedRef.current) setError(value);
  }, []);
  const safeSetWaitPosition = useCallback((value: number | null) => {
    if (isMountedRef.current) setWaitPosition(value);
  }, []);

  const stopMatchingInternal = useCallback(
    async (cancelQueue: boolean, updateState: boolean, log: boolean) => {
      if (log)
        console.log("[useMatching] stopMatching, cancelQueue:", cancelQueue);
      isMatchingRef.current = false;
      retryCountRef.current = 0;
      lastMessageAtRef.current = null;

      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent onclose handler from firing
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
        safeSetIsMatching(false);
        safeSetError(null);
      }

      if (cancelQueue && peerId) {
        try {
          const disconnectUrl = MATCHMAKER_URL.replace(/^ws/, "http");
          await fetch(`${disconnectUrl}/match/disconnect?peer_id=${peerId}`, {
            method: "PATCH",
            credentials: "include",
          });
          console.log("[useMatching] Disconnected from matchmaker");
        } catch (err) {
          console.error("[useMatching] Failed to disconnect:", err);
        }
      }
    },
    [peerId, safeSetError, safeSetIsMatching],
  );

  const stopMatching = useCallback(
    async (cancelQueue: boolean = true) => {
      userInitiatedStopRef.current = true;
      await stopMatchingInternal(cancelQueue, true, true);
      // Reset userInitiatedStopRef after a short delay to allow for the onclose handler
      setTimeout(() => {
        userInitiatedStopRef.current = false;
      }, 1000);
    },
    [stopMatchingInternal],
  );

  const startMatching = useCallback(() => {
    // Use ref-based guard (state can be stale due to React batching)
    if (isMatchingRef.current || !peerId) {
      console.log(
        "[useMatching] Cannot start matching: already matching or no peerId.",
        { isMatchingRef: isMatchingRef.current },
      );
      return;
    }

    console.log("[useMatching] startMatching");
    isMatchingRef.current = true;
    userInitiatedStopRef.current = false;
    safeSetError(null);
    safeSetMatchData(null);
    safeSetWaitPosition(null);
    safeSetIsMatching(true);

    // Close any lingering websocket from a previous session
    if (wsRef.current) {
      console.log(
        "[useMatching] Closing previous WebSocket before reconnecting",
      );
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close(1000, "Reconnecting");
      wsRef.current = null;
    }

    try {
      const wsUrl = `${MATCHMAKER_URL}/match?peer_id=${peerId}`;
      console.log("[useMatching] Connecting to WebSocket:", wsUrl);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[useMatching] Connected to matchmaker");
        lastMessageAtRef.current = Date.now();
        retryCountRef.current = 0;

        const searchMessage = {
          type: "Search",
          interests,
          gender,
          filter: genderFilter,
          is_verified: isVerified,
          verified_only: verifiedOnly,
        };

        const messageStr = JSON.stringify(searchMessage);
        console.log("[useMatching] Sending message:", messageStr);
        ws.send(messageStr);

        const tick = () => {
          if (!isMatchingRef.current || wsRef.current !== ws) return;
          const now = Date.now();
          const lastMessageAt = lastMessageAtRef.current ?? now;
          if (now - lastMessageAt > 30000) {
            retryCountRef.current += 1;
            const maxRetries = 4;
            if (retryCountRef.current <= maxRetries) {
              const backoffDelay = Math.min(
                1000 * Math.pow(2, retryCountRef.current - 1),
                8000,
              );
              console.warn(
                "[useMatching] No matchmaker response, resending search (attempt",
                retryCountRef.current,
                "/",
                maxRetries,
                ") with backoff",
                backoffDelay,
                "ms",
              );
              ws.send(messageStr);
              lastMessageAtRef.current = now;
            } else {
              console.warn(
                "[useMatching] No matchmaker response after",
                maxRetries,
                "retries, restarting search",
              );
              stopMatchingInternal(true, true, false);
              const restartDelay = Math.min(
                1000 * Math.pow(2, consecutiveFailuresRef.current),
                16000,
              );
              consecutiveFailuresRef.current += 1;
              setTimeout(() => {
                if (isMountedRef.current) startMatching();
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
          console.log("[useMatching] Received:", message);
          lastMessageAtRef.current = Date.now();
          retryCountRef.current = 0;
          consecutiveFailuresRef.current = 0; // reset on any successful message

          switch (message.type) {
            case "Match":
              console.log(
                "[useMatching] Match found! Partner verified?",
                message.partner_is_verified,
              );
              safeSetMatchData({
                room_id: message.room_id,
                peer_id: message.peer_id,
                partner_id: message.partner_id,
                partner_is_verified: message.partner_is_verified || false,
              });

              joinRoom(
                message.room_id,
                message.partner_id,
                message.partner_is_verified || false,
              );
              safeSetIsMatching(false);
              stopMatching(false);
              break;

            case "Waiting":
              console.log(
                "[useMatching] Waiting in queue, position:",
                message.position,
              );
              safeSetWaitPosition(message.position);
              break;

            case "Error":
              console.error("[useMatching] Error:", message.message);
              safeSetError(message.message);
              safeSetIsMatching(false);
              stopMatching();
              break;

            default:
              console.log("[useMatching] Unknown message type:", message.type);
          }
        } catch (err) {
          console.error("[useMatching] Failed to parse message:", err);
        }
      };

      ws.onerror = (event) => {
        console.error("[useMatching] WebSocket error:", event);
        // Don't immediately give up — attempt reconnect with exponential backoff
        if (isMountedRef.current && !userInitiatedStopRef.current) {
          consecutiveFailuresRef.current += 1;
          const backoffMs =
            Math.min(
              1000 * Math.pow(2, consecutiveFailuresRef.current),
              30000,
            ) +
            Math.random() * 500; // jitter
          console.log(
            `[useMatching] Will retry in ${Math.round(backoffMs)}ms (attempt ${consecutiveFailuresRef.current})`,
          );
          safeSetError("Connection to matchmaker failed — retrying…");
          wsRef.current = null;
          if (consecutiveFailuresRef.current <= 5) {
            setTimeout(() => {
              if (
                isMountedRef.current &&
                !userInitiatedStopRef.current &&
                matchDataRef.current === null
              ) {
                startMatching();
              }
            }, backoffMs);
          } else {
            isMatchingRef.current = false;
            safeSetError(
              "Connection to matchmaker failed after multiple retries",
            );
            safeSetIsMatching(false);
          }
        } else {
          isMatchingRef.current = false;
          safeSetIsMatching(false);
          wsRef.current = null;
        }
      };

      ws.onclose = (event) => {
        const wasMatching = isMatchingRef.current;
        const hasMatchData = matchDataRef.current !== null;
        const wasUserStop = userInitiatedStopRef.current;
        isMatchingRef.current = false;
        console.log("[useMatching] Connection closed:", {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          wasMatching,
          hasMatchData,
          wasUserStop,
        });

        // Handle normal closure (1000) - this is expected when a match is found
        if (event.code === 1000) {
          console.log(
            "[useMatching] Connection closed normally:",
            event.reason,
          );
          wsRef.current = null;
          // Only restart if we were actively matching, didn't receive match data, component is mounted, and it wasn't a user-initiated stop
          // Also check that we haven't already received a match data update (even if it was cleared)
          if (
            wasMatching &&
            !hasMatchData &&
            isMountedRef.current &&
            !wasUserStop
          ) {
            console.log(
              "[useMatching] Restarting matching after normal closure (no match data)",
            );
            setTimeout(() => {
              if (
                isMountedRef.current &&
                !userInitiatedStopRef.current &&
                matchDataRef.current === null
              ) {
                startMatching();
              }
            }, 500);
          } else {
            console.log(
              "[useMatching] Not restarting matching - wasMatching:",
              wasMatching,
              "hasMatchData:",
              hasMatchData,
              "isMounted:",
              isMountedRef.current,
              "wasUserStop:",
              wasUserStop,
            );
          }
          return;
        }

        // Handle unexpected closures — retry with exponential backoff
        wsRef.current = null;
        if (isMountedRef.current && !wasUserStop && wasMatching) {
          consecutiveFailuresRef.current += 1;
          const backoffMs =
            Math.min(
              1000 * Math.pow(2, consecutiveFailuresRef.current),
              30000,
            ) +
            Math.random() * 500; // jitter
          console.log(
            `[useMatching] Unexpected close (${event.code}), retrying in ${Math.round(backoffMs)}ms (attempt ${consecutiveFailuresRef.current})`,
          );
          if (consecutiveFailuresRef.current <= 5) {
            safeSetError(
              `Reconnecting to matchmaker… (attempt ${consecutiveFailuresRef.current})`,
            );
            setTimeout(() => {
              if (
                isMountedRef.current &&
                !userInitiatedStopRef.current &&
                matchDataRef.current === null
              ) {
                startMatching();
              }
            }, backoffMs);
          } else {
            safeSetError(
              `Connection to matchmaker closed (${event.code}: ${event.reason})`,
            );
            safeSetIsMatching(false);
          }
        } else if (isMountedRef.current) {
          safeSetError(
            `Connection to matchmaker closed (${event.code}: ${event.reason})`,
          );
          safeSetIsMatching(false);
        }
      };

      timeoutRef.current = setTimeout(() => {
        if (isMatchingRef.current) {
          console.warn("[useMatching] Matching timeout");
          safeSetError("Matching timeout");
          stopMatching(true);
        }
      }, 60000);
    } catch (err) {
      isMatchingRef.current = false;
      console.error("[useMatching] Failed to connect:", err);
      safeSetError("Failed to connect to matchmaker");
      safeSetIsMatching(false);
    }
  }, [
    peerId,
    interests,
    gender,
    genderFilter,
    isVerified,
    verifiedOnly,
    joinRoom,
    stopMatching,
    safeSetError,
    safeSetIsMatching,
    safeSetMatchData,
    safeSetWaitPosition,
  ]);

  const stopMatchingRef = useRef(stopMatching);
  useEffect(() => {
    stopMatchingRef.current = stopMatching;
  }, [stopMatching]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopMatchingInternal(true, false, false);
    };
  }, [stopMatchingInternal]); // Only on unmount

  return {
    isMatching,
    matchData,
    setMatchData: safeSetMatchData,
    error,
    waitPosition,
    startMatching,
    stopMatching,
  };
}
