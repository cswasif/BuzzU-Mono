import { useCallback, useEffect, useRef } from 'react';
import { useSignalingContext, SignalingMessage, ChatMessage } from '../context/SignalingContext';
import { useSessionStore } from '../stores/sessionStore';

export function useSignaling() {
  const context = useSignalingContext();
  const { peerId, avatarSeed } = useSessionStore();

  // Legacy callback refs for backward compatibility
  const offerCallbackRef = useRef<((offer: RTCSessionDescriptionInit, from: string) => void) | null>(null);
  const answerCallbackRef = useRef<((answer: RTCSessionDescriptionInit, from: string) => void) | null>(null);
  const iceCandidateCallbackRef = useRef<((candidate: RTCIceCandidateInit, from: string) => void) | null>(null);
  const peerJoinCallbackRef = useRef<((peerId: string) => void) | null>(null);
  const peerLeaveCallbackRef = useRef<((peerId: string) => void) | null>(null);
  const chatMessageCallbackRef = useRef<((message: ChatMessage, from: string) => void) | null>(null);
  const typingCallbackRef = useRef<((isTyping: boolean, from: string) => void) | null>(null);
  const keysRequestCallbackRef = useRef<((from: string) => void) | null>(null);
  const keysResponseCallbackRef = useRef<((bundle: string, from: string) => void) | null>(null);
  const handshakeCallbackRef = useRef<((initiation: string, from: string) => void) | null>(null);
  const friendRequestCallbackRef = useRef<((action: 'send' | 'accept' | 'decline', from: string, username?: string, avatarSeed?: string) => void) | null>(null);
  const screenShareCallbackRef = useRef<((isSharing: boolean, from: string) => void) | null>(null);
  const voiceChatCallbackRef = useRef<((isMicOn: boolean, from: string) => void) | null>(null);
  const roomStatusCallbackRef = useRef<((status: string, activePeers?: number, maxPeers?: number) => void) | null>(null);

  // Subscribe to context messages and trigger legacy callbacks
  useEffect(() => {
    const unsubscribers = [
      context.onMessage('Offer', (msg) => {
        if (msg.from && msg.payload) offerCallbackRef.current?.(JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage('Answer', (msg) => {
        if (msg.from && msg.payload) answerCallbackRef.current?.(JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage('IceCandidate', (msg) => {
        if (msg.from && msg.payload) iceCandidateCallbackRef.current?.(JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage('Join', (msg) => {
        if (msg.peer_id && msg.peer_id !== peerId) peerJoinCallbackRef.current?.(msg.peer_id);
      }),
      context.onMessage('Leave', (msg) => {
        if (msg.peer_id) peerLeaveCallbackRef.current?.(msg.peer_id);
      }),
      context.onMessage('Chat', (msg) => {
        if (msg.from && msg.payload) chatMessageCallbackRef.current?.(JSON.parse(msg.payload), msg.from);
      }),
      context.onMessage('Typing', (msg) => {
        if (msg.from && typeof msg.typing === 'boolean') typingCallbackRef.current?.(msg.typing, msg.from);
      }),
      context.onMessage('RequestKeys', (msg) => {
        if (msg.from) keysRequestCallbackRef.current?.(msg.from);
      }),
      context.onMessage('KeysResponse', (msg) => {
        if (msg.from && msg.bundle) keysResponseCallbackRef.current?.(msg.bundle, msg.from);
      }),
      context.onMessage('SignalHandshake', (msg) => {
        if (msg.from && msg.initiation) handshakeCallbackRef.current?.(msg.initiation, msg.from);
      }),
      context.onMessage('FriendRequest', (msg) => {
        if (msg.from && msg.action) {
          friendRequestCallbackRef.current?.(msg.action, msg.from, msg.username, msg.avatarSeed);
        }
      }),
      context.onMessage('ScreenShare', (msg) => {
        if (msg.from && typeof msg.sharing === 'boolean') {
          screenShareCallbackRef.current?.(msg.sharing, msg.from);
        }
      }),
      context.onMessage('VoiceChat', (msg) => {
        console.log('[useSignaling] Received VoiceChat message:', msg);
        if (msg.from && typeof msg.sharing === 'boolean') {
          voiceChatCallbackRef.current?.(msg.sharing, msg.from);
        }
      }),
      context.onMessage('RoomStatus', (msg) => {
        if (msg.status) {
          roomStatusCallbackRef.current?.(msg.status, msg.active_peers, msg.max_peers);
        }
      }),
    ];

    return () => unsubscribers.forEach(unsub => unsub());
  }, [context, peerId]);

  // Wrapper methods
  const sendOffer = useCallback((targetPeerId: string, offer: RTCSessionDescriptionInit) => {
    context.sendMessage({ type: 'Offer', from: peerId, to: targetPeerId, payload: JSON.stringify(offer) });
  }, [context, peerId]);

  const sendAnswer = useCallback((targetPeerId: string, answer: RTCSessionDescriptionInit) => {
    context.sendMessage({ type: 'Answer', from: peerId, to: targetPeerId, payload: JSON.stringify(answer) });
  }, [context, peerId]);

  const sendIceCandidate = useCallback((targetPeerId: string, candidate: RTCIceCandidateInit) => {
    context.sendMessage({ type: 'IceCandidate', from: peerId, to: targetPeerId, payload: JSON.stringify(candidate) });
  }, [context, peerId]);

  const sendChatMessage = useCallback((targetPeerId: string, message: ChatMessage) => {
    context.sendMessage({ type: 'Chat', from: peerId, to: targetPeerId, payload: JSON.stringify(message) });
  }, [context, peerId]);

  const sendTypingState = useCallback((targetPeerId: string, isTyping: boolean) => {
    console.log('[useSignaling] sendTypingState called - targetPeerId:', targetPeerId, 'isTyping:', isTyping, 'peerId:', peerId);
    context.sendMessage({ type: 'Typing', from: peerId, to: targetPeerId, typing: isTyping });
  }, [context, peerId]);

  const publishKeys = useCallback((bundle: any) => {
    console.log('[useSignaling] [Signal Debug] Publishing keys, bundle length:', bundle?.length, 'peerId:', peerId);
    const bundleStr = typeof bundle === 'string' ? bundle : JSON.stringify(bundle);
    context.sendMessage({ type: 'PublishKeys', from: peerId, to: '', bundle: bundleStr });
    console.log('[useSignaling] [Signal Debug] PublishKeys message sent');
  }, [context, peerId]);

  const requestKeys = useCallback((targetPeerId: string) => {
    console.log('[useSignaling] [Signal Debug] Requesting keys from:', targetPeerId, 'peerId:', peerId);
    context.sendMessage({ type: 'RequestKeys', from: peerId, to: targetPeerId });
    console.log('[useSignaling] [Signal Debug] RequestKeys message sent');
  }, [context, peerId]);

  const sendKeysResponse = useCallback((targetPeerId: string, bundle: any) => {
    console.log('[useSignaling] [Signal Debug] Sending keys response to:', targetPeerId, 'bundle length:', bundle?.length);
    const bundleStr = typeof bundle === 'string' ? bundle : JSON.stringify(bundle);
    context.sendMessage({ type: 'KeysResponse', from: peerId, to: targetPeerId, bundle: bundleStr });
    console.log('[useSignaling] [Signal Debug] KeysResponse message sent');
  }, [context, peerId]);

  const sendHandshake = useCallback((targetPeerId: string, initiation: any) => {
    console.log('[useSignaling] [Signal Debug] Sending handshake to:', targetPeerId, 'initiation length:', initiation?.length);
    const initiationStr = typeof initiation === 'string' ? initiation : JSON.stringify(initiation);
    context.sendMessage({ type: 'SignalHandshake', from: peerId, to: targetPeerId, initiation: initiationStr });
    console.log('[useSignaling] [Signal Debug] SignalHandshake message sent');
  }, [context, peerId]);

  const sendFriendRequest = useCallback((targetPeerId: string, action: 'send' | 'accept' | 'decline', username?: string, avatarSeed?: string) => {
    console.log('[useSignaling] [Friend Request] Sending friend request to:', targetPeerId, 'action:', action);
    context.sendMessage({ type: 'FriendRequest', from: peerId, to: targetPeerId, action, username, avatarSeed });
    console.log('[useSignaling] [Friend Request] FriendRequest message sent');
  }, [context, peerId]);

  const sendScreenShareState = useCallback((targetPeerId: string, isSharing: boolean) => {
    console.log('[useSignaling] Sending ScreenShare state to:', targetPeerId, 'sharing:', isSharing);
    context.sendMessage({ type: 'ScreenShare', from: peerId, to: targetPeerId, sharing: isSharing });
  }, [context, peerId]);

  const sendVoiceChatState = useCallback((targetPeerId: string, isMicOn: boolean) => {
    console.log('[useSignaling] Sending VoiceChat state to:', targetPeerId, 'micOn:', isMicOn);
    context.sendMessage({ type: 'VoiceChat', from: peerId, to: targetPeerId, sharing: isMicOn });
  }, [context, peerId]);

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
    // Callback setters
    onOffer: (cb: any) => { offerCallbackRef.current = cb; },
    onAnswer: (cb: any) => { answerCallbackRef.current = cb; },
    onIceCandidate: (cb: any) => { iceCandidateCallbackRef.current = cb; },
    onPeerJoin: (cb: any) => { peerJoinCallbackRef.current = cb; },
    onPeerLeave: (cb: any) => { peerLeaveCallbackRef.current = cb; },
    onChatMessage: (cb: any) => { chatMessageCallbackRef.current = cb; },
    onTyping: (cb: any) => { typingCallbackRef.current = cb; },
    onKeysRequest: (cb: any) => { keysRequestCallbackRef.current = cb; },
    onKeysResponse: (cb: any) => { keysResponseCallbackRef.current = cb; },
    onHandshake: (cb: any) => { handshakeCallbackRef.current = cb; },
    onFriendRequest: (cb: any) => { friendRequestCallbackRef.current = cb; },
    onScreenShare: (cb: (isSharing: boolean, from: string) => void) => { screenShareCallbackRef.current = cb; },
    onVoiceChat: (cb: (isMicOn: boolean, from: string) => void) => { voiceChatCallbackRef.current = cb; },
    onRoomStatus: (cb: (status: string, activePeers?: number, maxPeers?: number) => void) => { roomStatusCallbackRef.current = cb; },
    // Media stream methods from context
    onRemoteStream: (callback: (stream: MediaStream) => void) => {
      // This is a bit tricky since we want to handle the remote stream change reactively
      // But for compatibility we'll just use a useEffect in components or similar.
      // Actually, for now, we'll just expose the setter as well.
    }
  };
}
