import { useCallback, useEffect, useRef } from "react";
import {
  useSignalingContext,
  SignalingMessage,
  ChatMessage,
} from "../context/SignalingContext";
import { useSessionStore } from "../stores/sessionStore";

const SKIP_DEDUP_TTL_MS = 30_000;

const randomHex = (bytes: number) => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.getRandomValues === "function"
  ) {
    const arr = new Uint8Array(bytes);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

const makeSkipId = () => `skip_${Date.now()}_${randomHex(8)}`;

export function useSignaling() {
  const isDev = import.meta.env.DEV;
  const context = useSignalingContext();
  const { peerId, avatarSeed, currentRoomId, partnerId } = useSessionStore();
  const typingStateRef = useRef<Record<string, boolean | undefined>>({});
  const screenShareStateRef = useRef<Record<string, { value: boolean; ts: number } | undefined>>({});
  const voiceChatStateRef = useRef<Record<string, { value: boolean; ts: number } | undefined>>({});
  const pendingSkipAckRef = useRef<Map<string, { targetPeerId: string; sentAt: number }>>(new Map());
  const receivedSkipRef = useRef<Map<string, number>>(new Map());

  const offerListenersRef = useRef<
    Set<(offer: RTCSessionDescriptionInit, from: string) => void>
  >(new Set());
  const answerListenersRef = useRef<
    Set<(answer: RTCSessionDescriptionInit, from: string) => void>
  >(new Set());
  const iceCandidateListenersRef = useRef<
    Set<(candidate: RTCIceCandidateInit, from: string) => void>
  >(new Set());
  const peerJoinListenersRef = useRef<Set<(peerId: string) => void>>(new Set());
  const peerLeaveListenersRef = useRef<
    Set<(peerId: string, reason?: string, closeCode?: number) => void>
  >(new Set());
  const peerSkipListenersRef = useRef<Set<(from: string, reason?: string) => void>>(new Set());
  const chatMessageListenersRef = useRef<
    Set<(message: ChatMessage, from: string) => void>
  >(new Set());
  const typingListenersRef = useRef<
    Set<(isTyping: boolean, from: string) => void>
  >(new Set());
  const keysRequestListenersRef = useRef<Set<(from: string) => void>>(new Set());
  const keysResponseListenersRef = useRef<
    Set<(bundle: string, from: string) => void>
  >(new Set());
  const handshakeListenersRef = useRef<
    Set<(initiation: string, from: string) => void>
  >(new Set());
  const friendRequestListenersRef = useRef<
    Set<(
      action: "send" | "accept" | "decline",
      from: string,
      username?: string,
      avatarSeed?: string,
      avatarUrl?: string | null,
    ) => void>
  >(new Set());
  const screenShareListenersRef = useRef<
    Set<(isSharing: boolean, from: string) => void>
  >(new Set());
  const voiceChatListenersRef = useRef<
    Set<(isMicOn: boolean, from: string) => void>
  >(new Set());
  const profileListenersRef = useRef<
    Set<(
      from: string,
      username?: string,
      avatarSeed?: string,
      avatarUrl?: string | null,
    ) => void>
  >(new Set());
  const roomStatusListenersRef = useRef<
    Set<(status: string, activePeers?: number, maxPeers?: number) => void>
  >(new Set());
  const editMessageListenersRef = useRef<
    Set<(messageId: string, newContent: string, from: string) => void>
  >(new Set());
  const deleteMessageListenersRef = useRef<
    Set<(messageId: string, from: string) => void>
  >(new Set());

  const subscribeListener = useCallback(<T>(listeners: Set<T>, cb: T) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  const notifyListeners = useCallback(
    <TArgs extends unknown[]>(
      listeners: Set<(...args: TArgs) => void>,
      ...args: TArgs
    ) => {
      for (const listener of Array.from(listeners)) {
        listener(...args);
      }
    },
    [],
  );

  const pruneSkipMaps = useCallback(() => {
    const cutoff = Date.now() - SKIP_DEDUP_TTL_MS;
    for (const [skipId, ts] of receivedSkipRef.current) {
      if (ts < cutoff) {
        receivedSkipRef.current.delete(skipId);
      }
    }
    for (const [skipId, pending] of pendingSkipAckRef.current) {
      if (pending.sentAt < cutoff) {
        pendingSkipAckRef.current.delete(skipId);
      }
    }
  }, []);

  const activeSessionId =
    currentRoomId && partnerId && peerId
      ? `${currentRoomId}:${partnerId}:${peerId}`
      : undefined;

  const isStaleSignalSession = useCallback(
    (msg: SignalingMessage) => {
      const requiresSessionCheck =
        msg.type === "Offer" ||
        msg.type === "Answer" ||
        msg.type === "IceCandidate" ||
        msg.type === "Skip" ||
        msg.type === "SkipAck";
      if (!requiresSessionCheck) return false;
      if (
        msg.room_id &&
        currentRoomId &&
        msg.room_id !== currentRoomId
      ) {
        return true;
      }
      if (
        msg.session_id &&
        activeSessionId &&
        msg.session_id !== activeSessionId
      ) {
        return true;
      }
      return false;
    },
    [activeSessionId, currentRoomId],
  );

  // Subscribe to context messages and trigger legacy callbacks
  useEffect(() => {
    const unsubscribers = [
      context.onMessage("Offer", (msg) => {
        if (isStaleSignalSession(msg)) return;
        if (msg.from && msg.payload)
          notifyListeners(offerListenersRef.current, JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage("Answer", (msg) => {
        if (isStaleSignalSession(msg)) return;
        if (msg.from && msg.payload)
          notifyListeners(answerListenersRef.current, JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage("IceCandidate", (msg) => {
        if (isStaleSignalSession(msg)) return;
        if (msg.from && msg.payload)
          notifyListeners(iceCandidateListenersRef.current, JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage("Join", (msg) => {
        if (msg.peer_id && msg.peer_id !== peerId)
          notifyListeners(peerJoinListenersRef.current, msg.peer_id);
      }),
      context.onMessage("Leave", (msg) => {
        if (msg.peer_id) {
          notifyListeners(peerLeaveListenersRef.current, msg.peer_id, msg.reason, msg.closeCode);
        }
      }),
      context.onMessage("Skip", (msg) => {
        if (isStaleSignalSession(msg)) return;
        pruneSkipMaps();
        if (msg.skipId) {
          if (receivedSkipRef.current.has(msg.skipId)) {
            return;
          }
          receivedSkipRef.current.set(msg.skipId, Date.now());
        }
        if (isDev) {
          console.log(`[useSignaling] Received skip message from ${msg.from}, reason: ${msg.reason}`);
        }
        if (msg.from) notifyListeners(peerSkipListenersRef.current, msg.from, msg.reason);
      }),
      context.onMessage("SkipAck", (msg) => {
        if (isStaleSignalSession(msg)) return;
        if (msg.skipId) {
          pendingSkipAckRef.current.delete(msg.skipId);
        }
      }),
      context.onMessage("Chat", (msg) => {
        if (msg.from && msg.payload)
          notifyListeners(chatMessageListenersRef.current, JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage("Typing", (msg) => {
        if (msg.from && typeof msg.typing === "boolean")
          notifyListeners(typingListenersRef.current, msg.typing, msg.from);
      }),
      context.onMessage("RequestKeys", (msg) => {
        if (msg.from) notifyListeners(keysRequestListenersRef.current, msg.from);
      }),
      context.onMessage("KeysResponse", (msg) => {
        if (msg.from && msg.bundle)
          notifyListeners(keysResponseListenersRef.current, msg.bundle, msg.from);
      }),
      context.onMessage("SignalHandshake", (msg) => {
        if (msg.from && msg.initiation)
          notifyListeners(handshakeListenersRef.current, msg.initiation, msg.from);
      }),
      context.onMessage("FriendRequest", (msg) => {
        if (msg.from && msg.action) {
          notifyListeners(
            friendRequestListenersRef.current,
            msg.action,
            msg.from,
            msg.username,
            msg.avatarSeed,
            msg.avatarUrl ?? null,
          );
        }
      }),
      context.onMessage("ScreenShare", (msg) => {
        if (msg.from && typeof msg.sharing === "boolean") {
          notifyListeners(screenShareListenersRef.current, msg.sharing, msg.from);
        }
      }),
      context.onMessage("VoiceChat", (msg) => {
        if (isDev) {
          console.log("[useSignaling] Received VoiceChat message:", msg);
        }
        if (msg.from && typeof msg.sharing === "boolean") {
          notifyListeners(voiceChatListenersRef.current, msg.sharing, msg.from);
        }
      }),
      context.onMessage("Profile", (msg) => {
        if (msg.from) {
          notifyListeners(
            profileListenersRef.current,
            msg.from,
            msg.username,
            msg.avatarSeed,
            msg.avatarUrl ?? null,
          );
        }
      }),
      context.onMessage("RoomStatus", (msg) => {
        if (msg.status) {
          notifyListeners(
            roomStatusListenersRef.current,
            msg.status,
            msg.active_peers,
            msg.max_peers,
          );
        }
      }),
      context.onMessage("EditMessage", (msg) => {
        if (msg.from && msg.editId && msg.payload) {
          notifyListeners(editMessageListenersRef.current, msg.editId, msg.payload, msg.from);
        }
      }),
      context.onMessage("DeleteMessage", (msg) => {
        if (msg.from && msg.deleteId) {
          notifyListeners(deleteMessageListenersRef.current, msg.deleteId, msg.from);
        }
      }),
    ];

    return () => unsubscribers.forEach((unsub) => unsub());
  }, [context, isStaleSignalSession, notifyListeners, peerId, pruneSkipMaps, isDev]);

  // Wrapper methods
  const sendOffer = useCallback(
    (targetPeerId: string, offer: RTCSessionDescriptionInit) => {
      const sessionTs = Date.now();
      context.sendMessage({
        type: "Offer",
        from: peerId,
        to: targetPeerId,
        payload: JSON.stringify(offer),
        timestamp: sessionTs,
        room_id: currentRoomId ?? undefined,
        session_id: activeSessionId,
      });
    },
    [activeSessionId, context, currentRoomId, peerId],
  );

  const sendAnswer = useCallback(
    (targetPeerId: string, answer: RTCSessionDescriptionInit) => {
      context.sendMessage({
        type: "Answer",
        from: peerId,
        to: targetPeerId,
        payload: JSON.stringify(answer),
        timestamp: Date.now(),
        room_id: currentRoomId ?? undefined,
        session_id: activeSessionId,
      });
    },
    [activeSessionId, context, currentRoomId, peerId],
  );

  const sendIceCandidate = useCallback(
    (targetPeerId: string, candidate: RTCIceCandidateInit) => {
      context.sendMessage({
        type: "IceCandidate",
        from: peerId,
        to: targetPeerId,
        payload: JSON.stringify(candidate),
        timestamp: Date.now(),
        room_id: currentRoomId ?? undefined,
        session_id: activeSessionId,
      });
    },
    [activeSessionId, context, currentRoomId, peerId],
  );

  const sendChatMessage = useCallback(
    (targetPeerId: string, message: ChatMessage) => {
      context.sendMessage({
        type: "Chat",
        from: peerId,
        to: targetPeerId,
        payload: JSON.stringify(message),
      });
    },
    [context, peerId],
  );

  const sendTypingState = useCallback(
    (targetPeerId: string, isTyping: boolean) => {
      const typingKey = targetPeerId || "__room__";
      if (typingStateRef.current[typingKey] === isTyping) {
        return;
      }
      typingStateRef.current[typingKey] = isTyping;
      if (import.meta.env.DEV) {
        console.log(
          "[useSignaling] sendTypingState called - targetPeerId:",
          targetPeerId,
          "isTyping:",
          isTyping,
          "peerId:",
          peerId,
        );
      }
      context.sendMessage({
        type: "Typing",
        from: peerId,
        to: targetPeerId,
        typing: isTyping,
        avatarUrl: useSessionStore.getState().avatarUrl,
      });
    },
    [context, peerId],
  );

  const sendSkip = useCallback(
    (targetPeerId: string, reason: string = "skip") => {
      pruneSkipMaps();
      const skipId = makeSkipId();
      if (isDev) {
        console.log(`[useSignaling] Sending skip message from ${peerId} to ${targetPeerId}, reason: ${reason}`);
      }
      context.sendMessage({
        type: "Skip",
        from: peerId,
        to: targetPeerId,
        reason,
        skipId,
        room_id: currentRoomId ?? undefined,
        session_id: activeSessionId,
      });
      pendingSkipAckRef.current.set(skipId, {
        targetPeerId,
        sentAt: Date.now(),
      });
      
      // Add a retry mechanism for skip messages to ensure delivery
      // This is critical for user experience - partner should get instant notification
      setTimeout(() => {
        // Retry once after 500ms if connection is still active
        if (context.isConnected && pendingSkipAckRef.current.has(skipId)) {
          if (isDev) {
            console.log(`[useSignaling] Retrying skip message from ${peerId} to ${targetPeerId}`);
          }
          context.sendMessage({
            type: "Skip",
            from: peerId,
            to: targetPeerId,
            reason,
            skipId,
            room_id: currentRoomId ?? undefined,
            session_id: activeSessionId,
          });
        }
      }, 500);
    },
    [activeSessionId, context, currentRoomId, peerId, pruneSkipMaps],
  );

  const publishKeys = useCallback(
    (bundle: any) => {
      if (isDev) {
        console.log(
          "[useSignaling] [Signal Debug] Publishing keys, bundle length:",
          bundle?.length,
          "peerId:",
          peerId,
        );
      }
      const bundleStr =
        typeof bundle === "string" ? bundle : JSON.stringify(bundle);
      context.sendMessage({
        type: "PublishKeys",
        from: peerId,
        to: "",
        bundle: bundleStr,
      });
      if (isDev) {
        console.log("[useSignaling] [Signal Debug] PublishKeys message sent");
      }
    },
    [context, peerId],
  );

  const requestKeys = useCallback(
    (targetPeerId: string) => {
      if (isDev) {
        console.log(
          "[useSignaling] [Signal Debug] Requesting keys from:",
          targetPeerId,
          "peerId:",
          peerId,
        );
      }
      context.sendMessage({
        type: "RequestKeys",
        from: peerId,
        to: targetPeerId,
      });
      if (isDev) {
        console.log("[useSignaling] [Signal Debug] RequestKeys message sent");
      }
    },
    [context, peerId],
  );

  const sendKeysResponse = useCallback(
    (targetPeerId: string, bundle: any) => {
      if (isDev) {
        console.log(
          "[useSignaling] [Signal Debug] Sending keys response to:",
          targetPeerId,
          "bundle length:",
          bundle?.length,
        );
      }
      const bundleStr =
        typeof bundle === "string" ? bundle : JSON.stringify(bundle);
      context.sendMessage({
        type: "KeysResponse",
        from: peerId,
        to: targetPeerId,
        bundle: bundleStr,
      });
      if (isDev) {
        console.log("[useSignaling] [Signal Debug] KeysResponse message sent");
      }
    },
    [context, peerId],
  );

  const sendHandshake = useCallback(
    (targetPeerId: string, initiation: any) => {
      if (isDev) {
        console.log(
          "[useSignaling] [Signal Debug] Sending handshake to:",
          targetPeerId,
          "initiation length:",
          initiation?.length,
        );
      }
      const initiationStr =
        typeof initiation === "string"
          ? initiation
          : JSON.stringify(initiation);
      context.sendMessage({
        type: "SignalHandshake",
        from: peerId,
        to: targetPeerId,
        initiation: initiationStr,
      });
      if (isDev) {
        console.log("[useSignaling] [Signal Debug] SignalHandshake message sent");
      }
    },
    [context, peerId],
  );

  const sendFriendRequest = useCallback(
    (
      targetPeerId: string,
      action: "send" | "accept" | "decline",
      username?: string,
      avatarSeed?: string,
      avatarUrl?: string | null,
    ) => {
      if (isDev) {
        console.log(
          "[useSignaling] [Friend Request] Sending friend request to:",
          targetPeerId,
          "action:",
          action,
        );
      }
      context.sendMessage({
        type: "FriendRequest",
        from: peerId,
        to: targetPeerId,
        action,
        username,
        avatarSeed,
        avatarUrl: avatarUrl ?? null,
      });
      if (isDev) {
        console.log("[useSignaling] [Friend Request] FriendRequest message sent");
      }
    },
    [context, peerId],
  );

  const sendScreenShareState = useCallback(
    (targetPeerId: string, isSharing: boolean) => {
      const signalKey = targetPeerId || "__room__";
      const now = Date.now();
      const previous = screenShareStateRef.current[signalKey];
      if (previous && previous.value === isSharing && now - previous.ts < 1200) {
        return;
      }
      screenShareStateRef.current[signalKey] = { value: isSharing, ts: now };
      if (isDev) {
        console.log(
          "[useSignaling] Sending ScreenShare state to:",
          targetPeerId,
          "sharing:",
          isSharing,
        );
      }
      context.sendMessage({
        type: "ScreenShare",
        from: peerId,
        to: targetPeerId,
        sharing: isSharing,
      });
    },
    [context, peerId],
  );

  const sendEditMessage = useCallback(
    (targetPeerId: string, messageId: string, encryptedPayload: string) => {
      context.sendMessage({
        type: "EditMessage",
        from: peerId,
        to: targetPeerId,
        editId: messageId,
        payload: encryptedPayload,
      });
    },
    [context, peerId],
  );

  const sendDeleteMessage = useCallback(
    (targetPeerId: string, messageId: string) => {
      if (isDev) {
        console.log("[useSignaling] sendDeleteMessage called - targetPeerId:", targetPeerId, "messageId:", messageId, "peerId:", peerId);
      }
      context.sendMessage({
        type: "DeleteMessage",
        from: peerId,
        to: targetPeerId,
        deleteId: messageId,
      });
      if (isDev) {
        console.log("[useSignaling] DeleteMessage message sent");
      }
    },
    [context, peerId],
  );

  const sendVoiceChatState = useCallback(
    (targetPeerId: string, isMicOn: boolean) => {
      const signalKey = targetPeerId || "__room__";
      const now = Date.now();
      const previous = voiceChatStateRef.current[signalKey];
      if (previous && previous.value === isMicOn && now - previous.ts < 1200) {
        return;
      }
      voiceChatStateRef.current[signalKey] = { value: isMicOn, ts: now };
      if (isDev) {
        console.log(
          "[useSignaling] Sending VoiceChat state to:",
          targetPeerId,
          "micOn:",
          isMicOn,
        );
      }
      context.sendMessage({
        type: "VoiceChat",
        from: peerId,
        to: targetPeerId,
        sharing: isMicOn,
      });
    },
    [context, peerId],
  );

  const sendProfileUpdate = useCallback(
    (
      targetPeerId: string,
      profile: {
        username?: string;
        avatarSeed?: string;
        avatarUrl?: string | null;
      },
    ) => {
      context.sendMessage({
        type: "Profile",
        from: peerId,
        to: targetPeerId,
        username: profile.username,
        avatarSeed: profile.avatarSeed,
        avatarUrl: profile.avatarUrl ?? null,
      });
    },
    [context, peerId],
  );

  return {
    ...context,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendChatMessage,
    sendTypingState,
    publishKeys,
    requestKeys,
    sendKeysResponse,
    sendHandshake,
    sendFriendRequest,
    sendScreenShareState,
    sendVoiceChatState,
    sendProfileUpdate,
    sendEditMessage,
    sendDeleteMessage,
    sendSkip,
    // Callback subscriptions
    onOffer: (cb: (offer: RTCSessionDescriptionInit, from: string) => void) => {
      return subscribeListener(offerListenersRef.current, cb);
    },
    onAnswer: (cb: (answer: RTCSessionDescriptionInit, from: string) => void) => {
      return subscribeListener(answerListenersRef.current, cb);
    },
    onIceCandidate: (cb: (candidate: RTCIceCandidateInit, from: string) => void) => {
      return subscribeListener(iceCandidateListenersRef.current, cb);
    },
    onPeerJoin: (cb: (peerId: string) => void) => {
      return subscribeListener(peerJoinListenersRef.current, cb);
    },
    onPeerLeave: (cb: (peerId: string, reason?: string, closeCode?: number) => void) => {
      return subscribeListener(peerLeaveListenersRef.current, cb);
    },
    onPeerSkip: (cb: (from: string, reason?: string) => void) => {
      return subscribeListener(peerSkipListenersRef.current, cb);
    },
    onChatMessage: (cb: (message: ChatMessage, from: string) => void) => {
      return subscribeListener(chatMessageListenersRef.current, cb);
    },
    onTyping: (cb: (isTyping: boolean, from: string) => void) => {
      return subscribeListener(typingListenersRef.current, cb);
    },
    onKeysRequest: (cb: (from: string) => void) => {
      return subscribeListener(keysRequestListenersRef.current, cb);
    },
    onKeysResponse: (cb: (bundle: string, from: string) => void) => {
      return subscribeListener(keysResponseListenersRef.current, cb);
    },
    onHandshake: (cb: (initiation: string, from: string) => void) => {
      return subscribeListener(handshakeListenersRef.current, cb);
    },
    onFriendRequest: (cb: (action: "send" | "accept" | "decline", from: string, username?: string, avatarSeed?: string, avatarUrl?: string | null) => void) => {
      return subscribeListener(friendRequestListenersRef.current, cb);
    },
    onScreenShare: (cb: (isSharing: boolean, from: string) => void) => {
      return subscribeListener(screenShareListenersRef.current, cb);
    },
    onVoiceChat: (cb: (isMicOn: boolean, from: string) => void) => {
      return subscribeListener(voiceChatListenersRef.current, cb);
    },
    onProfile: (
      cb: (
        from: string,
        username?: string,
        avatarSeed?: string,
        avatarUrl?: string | null,
      ) => void,
    ) => {
      return subscribeListener(profileListenersRef.current, cb);
    },
    onRoomStatus: (
      cb: (status: string, activePeers?: number, maxPeers?: number) => void,
    ) => {
      return subscribeListener(roomStatusListenersRef.current, cb);
    },
    onEditMessage: (
      cb: (messageId: string, newContent: string, from: string) => void,
    ) => {
      return subscribeListener(editMessageListenersRef.current, cb);
    },
    onDeleteMessage: (
      cb: (messageId: string, from: string) => void,
    ) => {
      return subscribeListener(deleteMessageListenersRef.current, cb);
    },
    // Media stream methods from context
    onRemoteStream: (callback: (stream: MediaStream) => void) => {
      // Remote stream changes are reactive via context.remoteStream state.
      // Components should use context.remoteStream directly in a useEffect,
      // or subscribe via context.setRemoteStream to push a new stream in.
      // This callback form is kept for API compatibility; call it immediately
      // if a stream is already present so callers don't miss the current value.
      if (context.remoteStream) {
        callback(context.remoteStream);
      }
    },
  };
}
