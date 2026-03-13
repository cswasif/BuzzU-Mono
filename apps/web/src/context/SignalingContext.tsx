import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { useSessionStore } from "../stores/sessionStore";

const SIGNALING_URL =
  import.meta.env.VITE_SIGNALING_URL ||
  "wss://buzzu-signaling.md-wasif-faisal.workers.dev";

export interface SignalingMessage {
  type:
  | "RoomStatus"
  | "Join"
  | "Offer"
  | "Answer"
  | "IceCandidate"
  | "PeerList"
  | "Leave"
  | "Error"
  | "Relay"
  | "RelayRequest"
  | "RelayResponse"
  | "Reachability"
  | "Chat"
  | "Typing"
  | "PublishKeys"
  | "RequestKeys"
  | "KeysResponse"
  | "SignalHandshake"
  | "FriendRequest"
  | "ScreenShare"
  | "VoiceChat"
  | "Profile"
  | "Encrypted"
  | "KeyExchange"
  | "EditMessage"
  | "DeleteMessage"
  | "Skip";
  from?: string;
  to?: string;
  room_id?: string;
  peer_id?: string;
  payload?: string;
  bundle?: string;
  initiation?: string;
  peers?: string[];
  message?: string;
  typing?: boolean;
  via?: string;
  hop_count?: number;
  timestamp?: number;
  candidates?: Array<{ peer_id: string; rtt_ms: number; reliability: number }>;
  action?: "send" | "accept" | "decline";
  sharing?: boolean;
  username?: string;
  avatarSeed?: string;
  avatarUrl?: string | null;
  status?: string;
  active_peers?: number;
  max_peers?: number;
  /** EditMessage: the ID of the message being edited */
  editId?: string;
  /** DeleteMessage: the ID of the message being deleted */
  deleteId?: string;
  reason?: string;
}

export interface ChatMessage {
  id: string;
  username: string;
  avatarSeed: string;
  avatarUrl?: string | null;
  timestamp: string;
  content: string;
  encryptedContent?: string;
  isVerified?: boolean;
  replyToMessage?: { id: string; content: string } | null;
}

interface SignalingContextType {
  isConnected: boolean;
  peersInRoom: string[];
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  error: string | null;
  connect: (
    roomId: string,
    currentPeerId: string,
    options?: { roomType?: string; roomKey?: string; accessKey?: string },
  ) => void;
  disconnect: () => void;
  sendMessage: (message: SignalingMessage) => void;
  onMessage: (
    type: SignalingMessage["type"],
    callback: (msg: SignalingMessage) => void,
  ) => () => void;
  // Media methods
  startLocalStream: (
    constraints?: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  stopLocalStream: () => void;
  setRemoteStream: (stream: MediaStream | null) => void;
}

const SignalingContext = createContext<SignalingContextType | null>(null);

export const useSignalingContext = () => {
  const context = useContext(SignalingContext);
  if (!context) {
    throw new Error(
      "useSignalingContext must be used within a SignalingProvider",
    );
  }
  return context;
};

export const SignalingProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [peersInRoom, setPeersInRoom] = useState<string[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedRoomId, setConnectedRoomId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const messageQueueRef = useRef<SignalingMessage[]>([]);
  const callbacksRef = useRef<
    Map<string, Set<(msg: SignalingMessage) => void>>
  >(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const shouldReconnectRef = useRef(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isConnectingRef = useRef(false);

  const { peerId, avatarSeed } = useSessionStore();

  const connectedRoomIdRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    isConnectingRef.current = false;
    messageQueueRef.current = [];
    if (heartbeatTimerRef.current) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
    if (wsRef.current) {
      console.log("[SignalingContext] Disconnecting WebSocket");
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    setConnectedRoomId(null);
    connectedRoomIdRef.current = null;
    setPeersInRoom([]);
    setRemoteStream(null);
  }, []);

  const connect = useCallback(
    (
      roomId: string,
      currentPeerId: string,
      options?: { roomType?: string; roomKey?: string; accessKey?: string },
    ) => {
      if (!roomId || !currentPeerId) return;
      // Guard: skip if already connected/connecting to the same room
      if (
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        connectedRoomIdRef.current === roomId
      )
        return;
      if (isConnectingRef.current && connectedRoomIdRef.current === roomId)
        return;

      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }

      try {
        isConnectingRef.current = true;
        console.log("[SignalingContext] Connecting to room:", roomId);
        const params = new URLSearchParams({ peer_id: currentPeerId });
        if (options?.roomType) params.set("room_type", options.roomType);
        if (options?.roomKey) params.set("room_key", options.roomKey);
        if (options?.accessKey) params.set("access_key", options.accessKey);
        const ws = new WebSocket(
          `${SIGNALING_URL}/room/${roomId}/websocket?${params.toString()}`,
        );
        wsRef.current = ws;
        connectedRoomIdRef.current = roomId;
        shouldReconnectRef.current = true;

        ws.onopen = () => {
          console.log("[SignalingContext] Connected to room:", roomId);
          isConnectingRef.current = false;
          setIsConnected(true);
          setConnectedRoomId(roomId);
          setError(null);

          messageQueueRef.current.forEach((msg) =>
            ws.send(JSON.stringify(msg)),
          );
          messageQueueRef.current = [];

          // PeerJS-style recursive setTimeout heartbeat (not setInterval)
          // Keeps the Cloudflare Durable Object WebSocket alive (idle timeout ~30s)
          const scheduleHeartbeat = () => {
            heartbeatTimerRef.current = setTimeout(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                // Send a minimal keepalive — empty string resets CF
                // Durable Object idle timer without triggering
                // deserialization errors in the Rust worker.
                wsRef.current.send("");
                scheduleHeartbeat();
              }
            }, 25000); // 25s < CF's 30s idle timeout
          };
          if (heartbeatTimerRef.current)
            clearTimeout(heartbeatTimerRef.current);
          scheduleHeartbeat();
        };

        ws.onmessage = (event) => {
          try {
            const message: SignalingMessage = JSON.parse(event.data);

            if (message.type === "PeerList") {
              setPeersInRoom(message.peers || []);
            } else if (message.type === "Join" && message.peer_id !== peerId) {
              setPeersInRoom((prev) =>
                prev.includes(message.peer_id!)
                  ? prev
                  : [...prev, message.peer_id!],
              );
            } else if (message.type === "Leave" && message.peer_id) {
              setPeersInRoom((prev) =>
                prev.filter((id) => id !== message.peer_id),
              );
            } else if (message.type === "Error") {
              setError(message.message || "Unknown error");
            }

            const typeCallbacks = callbacksRef.current.get(message.type);
            if (typeCallbacks) {
              if (
                message.type === "PublishKeys" ||
                message.type === "RequestKeys" ||
                message.type === "KeysResponse" ||
                message.type === "SignalHandshake" ||
                message.type === "DeleteMessage" ||
                message.type === "EditMessage"
              ) {
                console.log(
                  "[SignalingContext] [Signal Debug] Received",
                  message.type,
                  "from:",
                  message.from,
                  "to:",
                  message.to,
                  message.type === "DeleteMessage" ? `deleteId=${message.deleteId}` : message.type === "EditMessage" ? `editId=${message.editId}` : '',
                );
              }
              typeCallbacks.forEach((cb) => cb(message));
            }
          } catch (e) {
            console.error("[SignalingContext] Message parse error", e);
          }
        };

        ws.onclose = (event) => {
          console.log(
            "[SignalingContext] Connection closed",
            event.code,
            event.reason,
          );
          isConnectingRef.current = false;

          // Code 4000 = evicted by a newer connection from the same peer.
          // This is expected during reconnects — do NOT update state or reconnect.
          if (event.code === 4000) {
            console.log(
              "[SignalingContext] Stale socket evicted by server — ignoring",
            );
            return;
          }

          setIsConnected(false);
          setConnectedRoomId(null);
          wsRef.current = null;
          if (heartbeatTimerRef.current) {
            clearTimeout(heartbeatTimerRef.current);
            heartbeatTimerRef.current = null;
          }

          if (
            (event.code === 1006 || event.code === 1001) &&
            shouldReconnectRef.current
          ) {
            console.log(
              "[SignalingContext] Abnormal closure, scheduling reconnect...",
            );
            setTimeout(() => {
              if (connectedRoomIdRef.current && shouldReconnectRef.current) {
                // Always read peerId from store at reconnect time — avoids
                // stale closure over the original `currentPeerId` parameter.
                const latestPeerId = useSessionStore.getState().peerId;
                connect(connectedRoomIdRef.current, latestPeerId);
              }
            }, 2000);
          }
        };

        ws.onerror = () => {
          console.error("[SignalingContext] WebSocket error");
          isConnectingRef.current = false;
          setError("Connection failed");
          setIsConnected(false);
        };
      } catch (e) {
        console.error("[SignalingContext] Failed to connect", e);
        isConnectingRef.current = false;
        setError("Failed to initiate connection");
      }
    },
    [peerId],
  );

  const sendMessage = useCallback((message: SignalingMessage) => {
    if (message.type === "Typing") {
      console.log("[SignalingContext] Sending Typing message:", message);
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      messageQueueRef.current.push(message);
    }
  }, []);

  const onMessage = useCallback(
    (
      type: SignalingMessage["type"],
      callback: (msg: SignalingMessage) => void,
    ) => {
      if (!callbacksRef.current.has(type)) {
        callbacksRef.current.set(type, new Set());
      }
      callbacksRef.current.get(type)!.add(callback);
      return () => {
        callbacksRef.current.get(type)?.delete(callback);
      };
    },
    [],
  );

  const startLocalStream = useCallback(
    async (
      constraints: MediaStreamConstraints = { video: true, audio: true },
    ) => {
      if (localStreamRef.current) return localStreamRef.current;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        localStreamRef.current = stream;
        setLocalStream(stream);
        return stream;
      } catch (err) {
        console.error("[SignalingContext] Failed to get local stream:", err);
        setError("Failed to access camera/microphone");
        throw err;
      }
    },
    [],
  );

  const stopLocalStream = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
  }, []);

  const value = React.useMemo(
    () => ({
      isConnected,
      peersInRoom,
      localStream,
      remoteStream,
      error,
      connect,
      disconnect,
      sendMessage,
      onMessage,
      startLocalStream,
      stopLocalStream,
      setRemoteStream,
    }),
    [
      isConnected,
      peersInRoom,
      localStream,
      remoteStream,
      error,
      connect,
      disconnect,
      sendMessage,
      onMessage,
      startLocalStream,
      stopLocalStream,
      setRemoteStream,
    ],
  );

  return (
    <SignalingContext.Provider value={value}>
      {children}
    </SignalingContext.Provider>
  );
};
