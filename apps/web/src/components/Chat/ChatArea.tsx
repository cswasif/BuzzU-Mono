import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { GifPicker } from './GifPicker';
import { ReportModal } from './ReportModal';
import { ProfileModal } from './ProfileModal';
import { PartnerSkippedView } from './PartnerSkippedView';
import { Message } from './types';
import { Users, X } from 'lucide-react';
import { useMatching } from '../../hooks/useMatching';
import { useSignaling } from '../../hooks/useSignaling';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useCrypto } from '../../hooks/useCrypto';
import { useFileTransfer } from '../../hooks/useFileTransfer';
import { useScreenShare } from '../../hooks/useScreenShare';
import { useVoiceChat } from '../../hooks/useVoiceChat';
import { useConnectionResilience } from '../../hooks/useConnectionResilience';
import { useSessionStore } from '../../stores/sessionStore';
import { useMessageStore, EMPTY_MESSAGES } from '../../stores/messageStore';
import { useScreenShareStore } from '../../stores/screenShareStore';
import { useVoiceChatStore } from '../../stores/voiceChatStore';
import { ScreenShareViewer } from './ScreenShareViewer';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { funAnimalName } from 'fun-animal-names';
import { useWasm } from '../../hooks/useWasm';

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function makeId() {
  return Date.now().toString() + Math.random().toString(36).slice(2);
}

export type RoomType = 'match' | 'private' | 'help' | 'admin';

interface ChatAreaProps {
  /** If provided, reconnect to this room instead of starting a new search */
  roomId?: string;
  /** Room type for direct-connect mode (bypasses matchmaker) */
  roomType?: RoomType;
  /** Room key/password for private rooms */
  roomKey?: string;
  /** Access key for admin rooms */
  accessKey?: string;
  /** Called when user leaves a named room (back to main) */
  onLeaveRoom?: () => void;
}

function PeerListPanel({
  peersInRoom,
  onClose,
  isMobile
}: {
  peersInRoom: string[],
  onClose: () => void,
  isMobile: boolean
}) {
  const avatarSeed = useSessionStore(state => state.avatarSeed);
  const avatarUrl = useSessionStore(state => state.avatarUrl);

  const renderAvatar = (seed: string, url?: string | null) => (
    <img src={url || `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${seed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`} className="w-8 h-8 rounded-full bg-muted shrink-0" alt="Avatar" />
  );

  return (
    <div className={`border-l border-border bg-panel flex flex-col shrink-0 overflow-hidden ${isMobile ? 'absolute inset-y-0 right-0 w-64 lg:w-72 z-50 shadow-2xl animate-in slide-in-from-right-8 duration-200' : 'hidden md:flex w-64 lg:w-72 bg-panel/30'}`}>
      <div className="px-4 py-3 border-b border-border font-semibold text-sm flex justify-between items-center text-foreground shrink-0">
        <span>Online — {peersInRoom.length + 1}</span>
        {isMobile && (
          <button className="p-1 rounded-md hover:bg-white/10 transition-colors" onClick={onClose}>
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 chat-scrollbar">
        {/* You */}
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
          {renderAvatar(avatarSeed, avatarUrl)}
          <span className="text-sm font-medium truncate text-foreground flex-1">You</span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Me</span>
        </div>

        {/* Others */}
        {peersInRoom.map(pId => {
          const pName = funAnimalName(pId);
          return (
            <div key={pId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer mt-1">
              {renderAvatar(pId)}
              <span className="text-sm font-medium truncate text-muted-foreground hover:text-foreground transition-colors">{pName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatArea({ roomId: urlRoomId, roomType, roomKey, accessKey, onLeaveRoom }: ChatAreaProps) {
  const isDirectConnectMode = roomType && roomType !== 'match';
  const navigate = useNavigate();
  const [connectionState, setConnectionState] = useState<'idle' | 'searching' | 'connected' | 'partner_skipped' | 'self_skipped' | 'waiting'>(urlRoomId ? 'connected' : 'idle');
  const [partner, setPartner] = useState<{ name: string; avatarSeed: string } | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isSignalReady, setIsSignalReady] = useState(false);
  const [isVanishMode, setIsVanishMode] = useState(false);
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<{ username: string; avatarSeed: string; avatarUrl?: string | null; isVerified?: boolean } | null>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageToReport, setMessageToReport] = useState<Message | null>(null);
  const [roomStatus, setRoomStatus] = useState<{ status: string; activePeers: number; maxPeers: number } | null>(null);
  const [isPeerListOpen, setIsPeerListOpen] = useState(false);

  const handledMatchId = useRef(null);
  const keyExchangeInitiatedRef = useRef<string | null>(null);
  // When true, the reconnecting peer processes KeysResponse regardless of
  // initiator/responder role.  Without this, a reconnecting peer whose
  // peerId > partner's peerId would be classified as "responder" and silently
  // ignore the KeysResponse — while the partner never initiates a fresh
  // key exchange because *their* isSignalReady is already true → deadlock.
  const isReconnectingRef = useRef(false);
  const p2pInitRoomRef = useRef<string | null>(null);
  const p2pInitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileTransferChannelRef = useRef<RTCDataChannel | null>(null);
  const signalingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const blobUrlsRef = useRef<Set<string>>(new Set());

  const {
    isMatching,
    matchData,
    error: matchingError,
    startMatching,
    stopMatching,
    setMatchData,
  } = useMatching();

  const {
    isConnected: signalingConnected,
    peersInRoom,
    connect: connectSignaling,
    disconnect: disconnectSignaling,
    sendOffer,
    sendChatMessage,
    sendTypingState,
    publishKeys,
    requestKeys,
    sendKeysResponse,
    sendHandshake,
    sendFriendRequest: sendFriendRequestSignaling,
    sendScreenShareState,
    onChatMessage,
    onTyping,
    onPeerLeave,
    onKeysRequest,
    onKeysResponse,
    onHandshake,
    onFriendRequest,
    onScreenShare,
    sendVoiceChatState,
    onVoiceChat,
    onRoomStatus,
    remoteStream,
    error: signalingError,
  } = useSignaling();

  const { wasm } = useWasm();

  const {
    isReady: isCryptoReady,
    generatePreKeyBundle,
    initiateSignalSession,
    respondToSignalSession,
    encryptMessage,
    decryptMessage,
  } = useCrypto();

  const { onDataChannel, createPeerConnection, isDataChannelOpen, waitForDataChannelOpen, closeAllPeerConnections, getPeerConnection, getPeerConnections, applyTurnFallback, isFallbackActive } = useWebRTC();

  // ── Screen Share ─────────────────────────────────────────────────
  const { startScreenShare, stopScreenShare, isSharing: isLocalScreenSharing, screenStream: localScreenStream, onStopped: onScreenShareStopped, detachFromPC: detachScreenShare, forceStopCapture: forceStopScreenCapture, reattachToPC: reattachScreenShare } = useScreenShare();
  const { pendingAction: screenSharePendingAction, clearPendingAction: clearScreenShareAction, setLocalSharing, clearLocalSharing, isRemoteSharing, remoteStream: remoteScreenStream, remoteStreamVersion, reset: resetScreenShareStore, resetRemoteOnly: resetRemoteScreenShare } = useScreenShareStore();
  const isTheaterMode = isRemoteSharing && !!remoteScreenStream;

  // ── Voice Chat ──────────────────────────────────────────────────
  const { startMic, stopMic, detachFromPC: detachVoiceChat, forceStopMic, reattachToPC: reattachVoiceChat } = useVoiceChat();
  const { pendingAction: voicePendingAction, clearPendingAction: clearVoiceAction, isMicOn, isPartnerMicOn, setPartnerMicOn, reset: resetVoiceChatStore } = useVoiceChatStore();
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioGainRef = useRef<GainNode | null>(null);
  const audioCompressorRef = useRef<DynamicsCompressorNode | null>(null);
  const audioHighPassRef = useRef<BiquadFilterNode | null>(null);
  const audioLowPassRef = useRef<BiquadFilterNode | null>(null);
  const audioStreamIdRef = useRef<string | null>(null);

  // ── Connection Resilience (tab switch / minimize / screen sleep) ──
  useConnectionResilience({
    getPeerConnections,
    applyTurnFallback,
    isFallbackActive,
    isInChat: connectionState === 'connected',
  });

  // Track isCryptoReady state for debugging
  useEffect(() => {
    console.log('[ChatArea] [Signal Debug] isCryptoReady changed:', isCryptoReady);
  }, [isCryptoReady]);

  // Component mount/unmount tracking + timer cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear any pending timers on unmount to prevent state updates on unmounted component
      if (signalingTimeoutRef.current) {
        clearTimeout(signalingTimeoutRef.current);
        signalingTimeoutRef.current = null;
      }
      if (p2pInitTimerRef.current) {
        clearTimeout(p2pInitTimerRef.current);
        p2pInitTimerRef.current = null;
      }
      // Revoke all blob URLs to prevent memory leaks
      blobUrlsRef.current.forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (_) { /* already revoked */ }
      });
      blobUrlsRef.current.clear();
      if (audioSourceRef.current) {
        try { audioSourceRef.current.disconnect(); } catch (_) { }
        audioSourceRef.current = null;
      }
      if (audioGainRef.current) {
        try { audioGainRef.current.disconnect(); } catch (_) { }
        audioGainRef.current = null;
      }
      if (audioCompressorRef.current) {
        try { audioCompressorRef.current.disconnect(); } catch (_) { }
        audioCompressorRef.current = null;
      }
      if (audioHighPassRef.current) {
        try { audioHighPassRef.current.disconnect(); } catch (_) { }
        audioHighPassRef.current = null;
      }
      if (audioLowPassRef.current) {
        try { audioLowPassRef.current.disconnect(); } catch (_) { }
        audioLowPassRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (_) { }
        audioContextRef.current = null;
      }
      audioStreamIdRef.current = null;
    };
  }, []);

  // ── Screen Share: Handle pending actions from Sidebar button ──────
  useEffect(() => {
    if (!screenSharePendingAction) return;
    const currentPartnerId = useSessionStore.getState().partnerId;
    if (!currentPartnerId) return;

    const pc = getPeerConnection(currentPartnerId);
    if (!pc) {
      console.warn('[ChatArea] Screen share: No peer connection for', currentPartnerId);
      clearScreenShareAction();
      return;
    }

    if (screenSharePendingAction === 'start') {
      startScreenShare(pc, (offer) => sendOffer(currentPartnerId, offer))
        .then(() => {
          // Don't use `localScreenStream` from the closure — it's stale.
          // The sync effect below will push the stream into the store once
          // the useScreenShare hook updates `isLocalScreenSharing`.
          sendScreenShareState(currentPartnerId, true);
        })
        .catch(err => {
          console.error('[ChatArea] Screen share start failed:', err);
        })
        .finally(() => clearScreenShareAction());
    } else if (screenSharePendingAction === 'stop') {
      stopScreenShare(pc, (offer) => sendOffer(currentPartnerId, offer));
      clearLocalSharing();
      sendScreenShareState(currentPartnerId, false);
      clearScreenShareAction();
    }
  }, [screenSharePendingAction, getPeerConnection, startScreenShare, stopScreenShare, sendOffer, sendScreenShareState, clearLocalSharing, clearScreenShareAction]);

  // ── Screen Share: Sync local hook state → store ───────────────────
  useEffect(() => {
    if (isLocalScreenSharing && localScreenStream) {
      setLocalSharing(localScreenStream);
    } else if (!isLocalScreenSharing) {
      clearLocalSharing();
    }
  }, [isLocalScreenSharing, localScreenStream, setLocalSharing, clearLocalSharing]);

  // ── Screen Share: Handle browser "Stop sharing" button ────────────
  // When the user clicks the native browser "Stop sharing" chrome,
  // useScreenShare fires onStopped. We need to:
  //   1. Notify the remote peer (ScreenShare=false)
  //   2. Clear the store so the sidebar button stops glowing
  useEffect(() => {
    onScreenShareStopped(() => {
      console.log('[ChatArea] Browser "Stop sharing" detected — notifying remote peer');
      const currentPartnerId = useSessionStore.getState().partnerId;
      if (currentPartnerId) {
        sendScreenShareState(currentPartnerId, false);
      }
      clearLocalSharing();
    });
    return () => { onScreenShareStopped(null); };
  }, [onScreenShareStopped, sendScreenShareState, clearLocalSharing]);

  // ── Voice Chat: Handle pending actions from Sidebar mic button ────
  useEffect(() => {
    if (!voicePendingAction) return;
    const currentPartnerId = useSessionStore.getState().partnerId;
    if (!currentPartnerId) { clearVoiceAction(); return; }

    const pc = getPeerConnection(currentPartnerId);
    if (!pc) {
      console.warn('[ChatArea] VoiceChat: No peer connection for', currentPartnerId);
      clearVoiceAction();
      return;
    }

    if (voicePendingAction === 'start') {
      startMic(pc, (offer) => sendOffer(currentPartnerId, offer))
        .then(() => {
          sendVoiceChatState(currentPartnerId, true);
        })
        .catch(err => {
          console.error('[ChatArea] VoiceChat start failed:', err);
        })
        .finally(() => clearVoiceAction());
    } else if (voicePendingAction === 'stop') {
      stopMic(pc, (offer) => sendOffer(currentPartnerId, offer));
      sendVoiceChatState(currentPartnerId, false);
      clearVoiceAction();
    }
  }, [voicePendingAction, getPeerConnection, startMic, stopMic, sendOffer, sendVoiceChatState, clearVoiceAction]);

  // ── Voice Chat: Play remote audio ─────────────────────────────────
  // Note: We use remoteStream (the same stream that holds remote camera/mic audio).
  // The useWebRTC.ontrack handler routes camera/mic audio to context.setRemoteStream.
  useEffect(() => {
    if (!remoteAudioRef.current) return;

    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      console.log('[ChatArea] Voice Playback effect: isPartnerMicOn:', isPartnerMicOn, 'stream:', remoteStream.id, 'audioTracks:', remoteStream.getAudioTracks().length);
      remoteStream.getAudioTracks().forEach((track) => { track.enabled = true; });
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        console.log('[ChatArea] Binding remote stream to audio element');
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1;
      remoteAudioRef.current.play().catch(e => console.warn('[ChatArea] Audio autoplay blocked:', e));

      const needsNewGraph = audioStreamIdRef.current !== remoteStream.id;
      if (needsNewGraph) {
        if (audioSourceRef.current) {
          try { audioSourceRef.current.disconnect(); } catch (_) { }
          audioSourceRef.current = null;
        }
        if (audioGainRef.current) {
          try { audioGainRef.current.disconnect(); } catch (_) { }
          audioGainRef.current = null;
        }
        if (audioCompressorRef.current) {
          try { audioCompressorRef.current.disconnect(); } catch (_) { }
          audioCompressorRef.current = null;
        }
        if (audioHighPassRef.current) {
          try { audioHighPassRef.current.disconnect(); } catch (_) { }
          audioHighPassRef.current = null;
        }
        if (audioLowPassRef.current) {
          try { audioLowPassRef.current.disconnect(); } catch (_) { }
          audioLowPassRef.current = null;
        }
        if (audioContextRef.current) {
          try { audioContextRef.current.close(); } catch (_) { }
          audioContextRef.current = null;
        }

        const context = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = context.createMediaStreamSource(remoteStream);
        const highPass = context.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.frequency.value = 85;
        highPass.Q.value = 0.7;
        const lowPass = context.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 8000;
        lowPass.Q.value = 0.7;
        const compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -24;
        compressor.knee.value = 30;
        compressor.ratio.value = 10;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.25;

        source.connect(highPass);
        highPass.connect(lowPass);
        lowPass.connect(compressor);

        audioContextRef.current = context;
        audioSourceRef.current = source;
        audioCompressorRef.current = compressor;
        audioHighPassRef.current = highPass;
        audioLowPassRef.current = lowPass;
        audioGainRef.current = null;
        audioStreamIdRef.current = remoteStream.id;

        if (context.state === 'suspended') {
          const resume = () => {
            context.resume().catch(() => { });
            document.removeEventListener('click', resume);
            document.removeEventListener('touchstart', resume);
          };
          document.addEventListener('click', resume, { once: true });
          document.addEventListener('touchstart', resume, { once: true });
        }
      }
    } else if (remoteAudioRef.current.srcObject !== null) {
      console.log('[ChatArea] Unbinding remote stream (no audio tracks)');
      remoteAudioRef.current.srcObject = null;
      if (audioSourceRef.current) {
        try { audioSourceRef.current.disconnect(); } catch (_) { }
        audioSourceRef.current = null;
      }
      if (audioGainRef.current) {
        try { audioGainRef.current.disconnect(); } catch (_) { }
        audioGainRef.current = null;
      }
      if (audioCompressorRef.current) {
        try { audioCompressorRef.current.disconnect(); } catch (_) { }
        audioCompressorRef.current = null;
      }
      if (audioHighPassRef.current) {
        try { audioHighPassRef.current.disconnect(); } catch (_) { }
        audioHighPassRef.current = null;
      }
      if (audioLowPassRef.current) {
        try { audioLowPassRef.current.disconnect(); } catch (_) { }
        audioLowPassRef.current = null;
      }
      if (audioContextRef.current) {
        try { audioContextRef.current.close(); } catch (_) { }
        audioContextRef.current = null;
      }
      audioStreamIdRef.current = null;
    }
  }, [isPartnerMicOn, remoteStream]);

  const { partnerId, displayName, peerId, isInChat, partnerName, partnerAvatarSeed, partnerAvatarUrl, isVerified, partnerIsVerified, friendRequestsSent, friendRequestsReceived, friendList, sendFriendRequest: sendFriendRequestAction, acceptFriendRequest, declineFriendRequest, handleReceivedFriendRequest, avatarSeed, avatarUrl, leaveRoom, joinRoom, setPartnerAvatarUrl, currentRoomId: storeRoomId } = useSessionStore();

  // Messages live in a global Zustand store keyed by roomId — survives route
  // changes (DM ↔ matched chat). Same pattern as Rocket.Chat / Element.
  const activeRoomId = urlRoomId || storeRoomId || '';
  const messages = useMessageStore((s) => s.messages[activeRoomId] ?? EMPTY_MESSAGES);

  const fileTransferOptions = React.useMemo(() => ({
    onProgress: import.meta.env.DEV ? (p: number) => console.log(`[ChatArea] Transfer progress: ${p.toFixed(1)}%`) : () => { },
    onComplete: (blob: Blob, isVanish?: boolean) => {
      if (partnerId && isMountedRef.current) {
        const url = URL.createObjectURL(blob);
        blobUrlsRef.current.add(url);
        const newMessage = {
          id: makeId(),
          username: partnerName,
          avatarSeed: partnerAvatarSeed,
          avatarUrl: null,
          timestamp: now(),
          content: `![image](${url})`,
          isVerified: partnerIsVerified,
          isVanish: isVanish
        };
        const rid = activeRoomId;
        if (rid) useMessageStore.getState().addMessage(rid, newMessage);
      }
    },
  }), [partnerId, partnerName, partnerAvatarSeed, partnerIsVerified, activeRoomId]);

  const {
    sendFile,
    receiveChunk,
    resetTransfer,
    isTransferring,
    progress: transferProgress,
  } = useFileTransfer(fileTransferOptions);

  const startSearching = useCallback(() => {
    // Clear signaling timeout from previous match
    if (signalingTimeoutRef.current) {
      clearTimeout(signalingTimeoutRef.current);
      signalingTimeoutRef.current = null;
    }
    if (p2pInitTimerRef.current) {
      clearTimeout(p2pInitTimerRef.current);
      p2pInitTimerRef.current = null;
    }
    disconnectSignaling();
    closeAllPeerConnections();
    const roomToClear = useSessionStore.getState().currentRoomId;
    leaveRoom();
    setMatchData(null);
    resetTransfer();
    fileTransferChannelRef.current = null;
    setConnectionState('searching');
    if (roomToClear) useMessageStore.getState().clearRoom(roomToClear);
    setReplyingTo(null);
    setEditingMessage(null);
    setEditingMessageId(null);
    setIsSignalReady(false);
    setIsVanishMode(false);
    setIsPartnerTyping(false);
    // Preserve local screen capture across matches — only clear remote state
    detachScreenShare();
    resetRemoteScreenShare();
    handledMatchId.current = null;
    p2pInitRoomRef.current = null;
    hasReconnected.current = false;
    isReconnectingRef.current = false;
    // Reset URL to bare /chat/new when starting a new search
    navigate('/chat/new', { replace: true });
    startMatching();
  }, [startMatching, disconnectSignaling, closeAllPeerConnections, leaveRoom, setMatchData, navigate, detachScreenShare, resetRemoteScreenShare]);

  const handleStart = () => {
    console.log('[ChatArea] Manual START clicked');
    startSearching();
  };
  const handleStop = () => {
    console.log('[ChatArea] Manual STOP clicked');
    if (signalingTimeoutRef.current) {
      clearTimeout(signalingTimeoutRef.current);
      signalingTimeoutRef.current = null;
    }
    if (p2pInitTimerRef.current) {
      clearTimeout(p2pInitTimerRef.current);
      p2pInitTimerRef.current = null;
    }
    stopMatching();
    disconnectSignaling();
    closeAllPeerConnections();
    const roomToClear = useSessionStore.getState().currentRoomId;
    leaveRoom();
    setMatchData(null);
    resetTransfer();
    fileTransferChannelRef.current = null;
    setConnectionState('idle');
    setPartner(null);
    setIsSignalReady(false);
    setIsVanishMode(false);
    setIsPartnerTyping(false);
    // Full stop: kill the screen capture and mic entirely
    forceStopScreenCapture();
    resetScreenShareStore();
    forceStopMic();
    resetVoiceChatStore();
    handledMatchId.current = null;
    p2pInitRoomRef.current = null;
    hasReconnected.current = false;
    isReconnectingRef.current = false;
    navigate('/chat/new', { replace: true });
    if (roomToClear) useMessageStore.getState().clearRoom(roomToClear);
  };
  const handleSkip = () => {
    if (signalingTimeoutRef.current) {
      clearTimeout(signalingTimeoutRef.current);
      signalingTimeoutRef.current = null;
    }
    if (p2pInitTimerRef.current) {
      clearTimeout(p2pInitTimerRef.current);
      p2pInitTimerRef.current = null;
    }
    stopMatching();
    disconnectSignaling();
    closeAllPeerConnections();
    const roomToClear = useSessionStore.getState().currentRoomId;
    leaveRoom();
    setMatchData(null);
    resetTransfer();
    fileTransferChannelRef.current = null;
    setPartner(null);
    setConnectionState('self_skipped');
    setIsSignalReady(false);
    setIsVanishMode(false);
    setIsPartnerTyping(false);
    // Preserve local screen capture & mic — only clear remote & detach senders
    detachScreenShare();
    resetRemoteScreenShare();
    detachVoiceChat();
    useVoiceChatStore.getState().setPartnerMicOn(false);
    handledMatchId.current = null;
    p2pInitRoomRef.current = null;
    hasReconnected.current = false;
    isReconnectingRef.current = false;
    if (roomToClear) useMessageStore.getState().clearRoom(roomToClear);
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    setEditingMessage(null);
    setEditingMessageId(null);
  };

  const handleProfileClick = (username: string, avatarSeed: string, avatarUrl?: string | null, isVerified?: boolean) => {
    const currentAvatarUrl = username === partnerName ? partnerAvatarUrl : (avatarUrl || null);
    setSelectedProfile({ username, avatarSeed, avatarUrl: currentAvatarUrl, isVerified });
    setIsProfileModalOpen(true);
  };

  const handleEdit = (message: Message) => {
    // Only allow editing your own messages
    if (message.username === 'Me') {
      setEditingMessageId(message.id);
      setEditingMessage(null);
      setReplyingTo(null);
    }
  };

  const handleSaveEdit = (id: string, newContent: string) => {
    const rid = activeRoomId;
    if (rid) useMessageStore.getState().updateMessage(rid, id, (msg) => ({ ...msg, content: newContent }));
    setEditingMessageId(null);
  };

  const handleCancelEdit = () => setEditingMessageId(null);

  const handleReport = (message: Message) => {
    setMessageToReport(message);
    setIsReportModalOpen(true);
  };

  const handleDelete = (message: Message) => {
    const rid = activeRoomId;
    if (rid) useMessageStore.getState().removeMessage(rid, message.id);
  };

  const handleSendMessage = useCallback(async (content: string, replyToMessage?: Message | null) => {
    let encryptedContent: string | undefined;
    let isEncrypted = false;

    if (partnerId && isCryptoReady && isSignalReady) {
      try {
        const encrypted = await encryptMessage(partnerId, content);
        encryptedContent = JSON.stringify(Array.from(encrypted));
        isEncrypted = true;
      } catch (e) {
        console.error('[ChatArea] Encryption failed — refusing to send plaintext:', e);
        // SECURITY: Never silently downgrade to plaintext. Notify the user.
        const rid = activeRoomId;
        if (rid) useMessageStore.getState().addMessage(rid, {
          id: makeId(),
          username: 'System',
          avatarSeed: '',
          avatarUrl: null,
          timestamp: now(),
          content: '⚠ Message could not be sent — encryption failed. Try reconnecting.',
          isVerified: false,
          replyToMessage: null,
        });
        return; // Abort — do NOT send plaintext
      }
    }

    const message = {
      id: makeId(),
      username: 'Me',
      avatarSeed: avatarSeed,
      avatarUrl: avatarUrl || null,
      timestamp: now(),
      content, // Local message stays plaintext
      isVerified: isVerified,
      replyToMessage: replyToMessage || null,
    };

    const rid = activeRoomId;
    if (rid) useMessageStore.getState().addMessage(rid, message);

    if (sendChatMessage && (partnerId || isDirectConnectMode)) {
      const directTargets = isDirectConnectMode
        ? Array.from(new Set(peersInRoom))
        : (partnerId ? [partnerId] : []);
      const targets = directTargets.length > 0
        ? directTargets
        : (isDirectConnectMode ? [''] : []);

      targets.forEach((targetPeerId) => {
        sendChatMessage(targetPeerId, {
          id: message.id,
          username: displayName || 'Anonymous',
          avatarSeed: avatarSeed,
          avatarUrl: avatarUrl || null,
          timestamp: message.timestamp,
          // SECURITY: Never send plaintext alongside encrypted content
          // Cloudflare relays signaling — if encrypted, strip plaintext
          content: isEncrypted ? '[encrypted]' : content,
          encryptedContent,
          isVerified: isVerified,
          isEncrypted,
          replyToMessage: replyToMessage ? {
            id: replyToMessage.id,
            content: isEncrypted ? '[encrypted]' : replyToMessage.content,
          } : null,
        } as any);
      });
    }

    // Clear reply/edit state after sending
    setReplyingTo(null);
    setEditingMessage(null);
  }, [sendChatMessage, partnerId, displayName, isCryptoReady, encryptMessage, isVerified, isSignalReady, avatarSeed, avatarUrl, activeRoomId, isDirectConnectMode, peersInRoom]);

  useEffect(() => {
    onChatMessage((message, from) => {
      if (import.meta.env.DEV) console.log('[ChatArea] Received chat message:', message, 'from:', from);

      let content = message.content;
      const hasEncryptedContent = !!(message as any).encryptedContent;
      const isEncryptedFlag = !!(message as any).isEncrypted;
      let decryptionFailed = false;

      if (hasEncryptedContent && isCryptoReady) {
        try {
          const encryptedPayload = typeof (message as any).encryptedContent === 'string'
            ? JSON.parse((message as any).encryptedContent)
            : (message as any).encryptedContent;
          const bytes = new Uint8Array(encryptedPayload);
          const decrypted = decryptMessage(from, bytes);
          content = new TextDecoder().decode(decrypted);
        } catch (e) {
          console.error('[ChatArea] Decryption failed:', e);
          decryptionFailed = true;
        }
      } else if (isEncryptedFlag && isCryptoReady) {
        try {
          const binary = atob(content);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const decrypted = decryptMessage(from, bytes);
          content = new TextDecoder().decode(decrypted);
        } catch (e) {
          console.error('[ChatArea] Decryption failed:', e);
          decryptionFailed = true;
        }
      }

      // If decryption failed or message was encrypted but we couldn't decrypt,
      // show a user-friendly message instead of '[encrypted]' or garbled text
      if (decryptionFailed || (isEncryptedFlag && content === '[encrypted]')) {
        content = '⚠ Message could not be decrypted';
      }

      if (isMountedRef.current) {
        const rid = activeRoomId;
        if (rid) useMessageStore.getState().addMessage(rid, {
          id: message.id,
          username: message.username,
          avatarSeed: message.avatarSeed,
          avatarUrl: message.avatarUrl || null,
          timestamp: message.timestamp,
          content: content,
          isVerified: message.isVerified ?? partnerIsVerified,
          replyToMessage: message.replyToMessage ? {
            id: message.replyToMessage.id,
            username: funAnimalName(from),
            avatarSeed: from,
            avatarUrl: message.avatarUrl || null,
            timestamp: message.timestamp,
            content: message.replyToMessage.content,
          } : null,
        });

        if (from === partnerId && message.avatarUrl) {
          setPartnerAvatarUrl(message.avatarUrl);
        }
      }
    });

    onTyping((isTyping, from) => {
      if (from === partnerId && isMountedRef.current) {
        setIsPartnerTyping(isTyping);
      }
    });

    onPeerLeave((leftPeerId) => {
      const currentPartnerId = useSessionStore.getState().partnerId;
      if (leftPeerId === currentPartnerId && isMountedRef.current) {
        console.log('[ChatArea] Partner skipped/left the match!');
        setConnectionState('partner_skipped');
        disconnectSignaling();
        closeAllPeerConnections();
        resetTransfer();
        fileTransferChannelRef.current = null;
        setIsSignalReady(false);
        if (p2pInitTimerRef.current) {
          clearTimeout(p2pInitTimerRef.current);
          p2pInitTimerRef.current = null;
        }
        stopMatching(true);
        leaveRoom();
        setMatchData(null);
        handledMatchId.current = null;
        keyExchangeInitiatedRef.current = null;
        hasReconnected.current = false;
        isReconnectingRef.current = false;
        // Preserve local screen capture — only clear remote & detach senders
        detachScreenShare();
        resetRemoteScreenShare();
      }
    });

    onKeysRequest((from) => {
      console.log('[ChatArea] [Signal Debug] onKeysRequest received from:', from, 'partnerId:', partnerId, 'isCryptoReady:', isCryptoReady);
      if (from === partnerId && isCryptoReady) {
        try {
          console.log('[ChatArea] [Signal Debug] Generating pre-key bundle for:', from);
          const bundle = generatePreKeyBundle();
          console.log('[ChatArea] [Signal Debug] Pre-key bundle generated:', bundle ? 'success' : 'failed');
          // sendKeysResponse expects an object (or string), let it handle stringification
          sendKeysResponse(from, bundle as any);
          console.log('[ChatArea] [Signal Debug] Keys response sent to:', from);
        } catch (err) {
          console.error('[ChatArea] [Signal Debug] Error in onKeysRequest:', err);
        }
      } else {
        console.log('[ChatArea] [Signal Debug] Ignoring onKeysRequest - from:', from, '=== partnerId:', partnerId, '?', from === partnerId, 'isCryptoReady:', isCryptoReady);
      }
    });

    onKeysResponse((bundleStr, from) => {
      console.log('[ChatArea] [Signal Debug] onKeysResponse received from:', from, 'partnerId:', partnerId, 'isCryptoReady:', isCryptoReady);
      // ROLE ENFORCEMENT: Only the initiator (lower peerId) processes KeysResponse → initiateSignalSession.
      // The responder ignores this — they wait for the SignalHandshake instead.
      //
      // EXCEPTION: During a reconnect (DM → Chat transition), the reconnecting peer
      // always processes the response regardless of role.  The partner's isSignalReady
      // is already true and won't re-initiate, so the reconnecting peer MUST act as
      // initiator to avoid a deadlock.
      const myPeerId = useSessionStore.getState().peerId;
      const isInitiator = myPeerId < from;
      const reconnecting = isReconnectingRef.current;
      if (from === partnerId && isCryptoReady && isMountedRef.current && (isInitiator || reconnecting)) {
        try {
          if (reconnecting) {
            console.log('[ChatArea] [Signal Debug] [Reconnect] Overriding role — processing KeysResponse as reconnecting peer');
            isReconnectingRef.current = false;
          }
          console.log('[ChatArea] [Signal Debug] [Initiator] Processing keys response from:', from, 'bundle length:', typeof bundleStr === 'string' ? bundleStr.length : 'object');
          const initiation = initiateSignalSession(from, bundleStr);
          console.log('[ChatArea] [Signal Debug] [Initiator] Signal session initiated, handshake data:', initiation ? 'generated' : 'failed');
          sendHandshake(from, initiation as any);
          console.log('[ChatArea] [Signal Debug] [Initiator] Handshake sent to:', from);
          setIsSignalReady(true);
        } catch (err) {
          console.error('[ChatArea] [Signal Debug] Failed to initiate Signal session:', err);
          isReconnectingRef.current = false; // Reset even on failure
        }
      } else if (!isInitiator) {
        console.log('[ChatArea] [Signal Debug] [Responder] Ignoring KeysResponse — waiting for SignalHandshake instead');
      } else {
        console.log('[ChatArea] [Signal Debug] Ignoring onKeysResponse - from:', from, '=== partnerId:', partnerId, '?', from === partnerId, 'isCryptoReady:', isCryptoReady);
      }
    });

    onHandshake((initiationStr, from) => {
      console.log('[ChatArea] [Signal Debug] onHandshake received from:', from, 'partnerId:', partnerId, 'isCryptoReady:', isCryptoReady);
      // ROLE ENFORCEMENT: Only the responder (higher peerId) processes SignalHandshake → respondToSignalSession.
      // The initiator ignores this — they already have their session from initiateSignalSession.
      const myPeerId = useSessionStore.getState().peerId;
      const isResponder = myPeerId > from;
      if (from === partnerId && isCryptoReady && isMountedRef.current && isResponder) {
        try {
          console.log('[ChatArea] [Signal Debug] [Responder] Processing handshake from:', from, 'initiation length:', typeof initiationStr === 'string' ? initiationStr.length : 'object');
          respondToSignalSession(from, initiationStr);
          console.log('[ChatArea] [Signal Debug] [Responder] Signal session responded successfully');
          setIsSignalReady(true);
        } catch (err) {
          console.error('[ChatArea] [Signal Debug] Failed to respond to Signal handshake:', err);
        }
      } else if (!isResponder) {
        console.log('[ChatArea] [Signal Debug] [Initiator] Ignoring SignalHandshake — already have session from initiateSignalSession');
      } else {
        console.log('[ChatArea] [Signal Debug] Ignoring onHandshake - from:', from, '=== partnerId:', partnerId, '?', from === partnerId, 'isCryptoReady:', isCryptoReady);
      }
    });

    onFriendRequest((action, from, username, avatarSeed) => {
      console.log('[ChatArea] Received friend request action:', action, 'from:', from);
      if (action === 'send') {
        handleReceivedFriendRequest({
          id: from,
          username: username || 'Partner',
          avatarSeed: avatarSeed || from
        });
      } else if (action === 'accept') {
        acceptFriendRequest(from, username, avatarSeed);
      } else if (action === 'decline') {
        declineFriendRequest(from);
      }
    });

    // Screen share state notification from partner
    onScreenShare((isSharing, from) => {
      console.log('[ChatArea] Received ScreenShare state from:', from, 'sharing:', isSharing);
      if (from !== partnerId) return;

      if (isSharing) {
        // Set the flag BEFORE the WebRTC track arrives. The ontrack handler
        // in useWebRTC reads isRemoteSharing from the store to classify
        // the incoming video track as screen-share vs camera.
        //
        // If ontrack already fired (race: track arrived before signaling),
        // check for a video track on the PC that was misclassified as
        // camera (i.e., setRemoteStream was called, not setRemoteSharing).
        const currentPartnerId = useSessionStore.getState().partnerId;
        if (!currentPartnerId) return;
        const pc = getPeerConnection(currentPartnerId);
        if (pc) {
          const videoReceivers = pc.getReceivers()
            .filter(r => r.track && r.track.kind === 'video' && r.track.readyState === 'live');
          // If there's exactly one live video receiver and remoteSharing isn't
          // set yet, that track was likely misclassified as camera → promote it.
          if (videoReceivers.length > 0 && !useScreenShareStore.getState().isRemoteSharing) {
            const lastReceiver = videoReceivers[videoReceivers.length - 1];
            const stream = lastReceiver.track ? new MediaStream([lastReceiver.track]) : null;
            if (stream) {
              console.log('[ChatArea] Late screen-share classification: promoting video track to screen share');
              useScreenShareStore.getState().setRemoteSharing(stream);
            }
          }
        }
        // Even if no track yet, mark the store so ontrack can use this flag
        if (!useScreenShareStore.getState().isRemoteSharing) {
          // Pre-set the flag without a stream — ontrack will replace with actual stream
          useScreenShareStore.getState().setRemoteSharing(null as any);
        }
      } else {
        // Partner explicitly stopped — clear remote screen share.
        useScreenShareStore.getState().clearRemoteSharing();
      }
    });

    // Voice chat state notification from partner
    onVoiceChat((isMicOn, from) => {
      console.log('[ChatArea] Received VoiceChat state from:', from, 'micOn:', isMicOn, 'expectedPartner:', partnerId);
      if (from !== partnerId) return;
      setPartnerMicOn(isMicOn);
    });
  }, [onChatMessage, onTyping, onPeerLeave, partnerId, disconnectSignaling, isCryptoReady, decryptMessage, onKeysRequest, onKeysResponse, generatePreKeyBundle, sendKeysResponse, initiateSignalSession, onHandshake, respondToSignalSession, sendHandshake, setIsSignalReady, partnerIsVerified, onFriendRequest, leaveRoom, setMatchData, onScreenShare, onVoiceChat, setPartnerMicOn, getPeerConnection, activeRoomId]);

  const handleAddFriend = useCallback((peerId: string, username: string, avatarSeed: string) => {
    if (!peerId) return;
    sendFriendRequestAction(peerId);
    sendFriendRequestSignaling(peerId, 'send', displayName, useSessionStore.getState().avatarSeed);
  }, [sendFriendRequestAction, sendFriendRequestSignaling, displayName]);

  const handleAcceptFriendRequest = useCallback((peerId: string) => {
    acceptFriendRequest(peerId);
    sendFriendRequestSignaling(peerId, 'accept', displayName, useSessionStore.getState().avatarSeed);
  }, [acceptFriendRequest, sendFriendRequestSignaling, displayName]);

  const handleDeclineFriendRequest = useCallback((peerId: string) => {
    declineFriendRequest(peerId);
    sendFriendRequestSignaling(peerId, 'decline');
  }, [declineFriendRequest, sendFriendRequestSignaling]);

  const getFriendRequestStatus = useCallback((targetPeerId: string): 'none' | 'sent' | 'received' | 'friends' => {
    if (friendList.some(f => f.id === targetPeerId)) return 'friends';
    if (friendRequestsSent.includes(targetPeerId)) return 'sent';
    if (friendRequestsReceived[targetPeerId]) return 'received';
    return 'none';
  }, [friendList, friendRequestsSent, friendRequestsReceived]);

  const handleTyping = useCallback((isTyping: boolean) => {
    console.log('[ChatArea] handleTyping called with isTyping:', isTyping, 'partnerId:', partnerId);
    if (sendTypingState && (partnerId || isDirectConnectMode)) {
      const directTargets = isDirectConnectMode
        ? Array.from(new Set(peersInRoom))
        : (partnerId ? [partnerId] : []);
      const targets = directTargets.length > 0
        ? directTargets
        : (isDirectConnectMode ? [''] : []);

      targets.forEach((targetPeerId) => {
        console.log('[ChatArea] Sending typing state to peer:', targetPeerId || 'room', 'isTyping:', isTyping);
        sendTypingState(targetPeerId, isTyping);
      });
    }
  }, [partnerId, sendTypingState, isDirectConnectMode, peersInRoom]);

  const handleVanishOpen = useCallback((messageId: string) => {
    const rid = activeRoomId;
    if (rid) useMessageStore.getState().updateMessage(rid, messageId, (m) => {
      const urlMatch = m.content.match(/\((blob:.*?)\)/);
      if (urlMatch && urlMatch[1] && !m.vanishOpened) {
        URL.revokeObjectURL(urlMatch[1]);
      }
      return { ...m, vanishOpened: true };
    });
  }, [activeRoomId]);

  const handleGifSelect = useCallback((gif: any) => {
    const gifUrl = gif.url;
    handleSendMessage(`![gif](${gifUrl})`, replyingTo);
    setIsGifPickerOpen(false);
    handleTyping(false);
  }, [handleSendMessage, replyingTo, handleTyping]);

  const compressImage = useCallback(async (file: File): Promise<Blob> => {
    // Only compress images over 500KB or specific types
    if (file.size < 500 * 1024 || !file.type.startsWith('image/')) {
      return file;
    }

    if (!wasm || !wasm.ImageCompressor) {
      console.warn('[ChatArea] WASM/ImageCompressor not ready, sending original');
      return file;
    }

    const compressor = new wasm.ImageCompressor();
    try {
      console.log('[ChatArea] Compressing image:', file.name, (file.size / 1024).toFixed(1), 'KB');
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);

      // Shrink to fit under 500KB or 1280px max dimension
      const compressed = compressor.compress_to_webp(uint8Array, 1280, 1280);

      const blob = new Blob([compressed], { type: 'image/webp' });
      console.log('[ChatArea] Compression complete:', (blob.size / 1024).toFixed(1), 'KB');
      return blob;
    } catch (err) {
      console.error('[ChatArea] Compression failed, sending original:', err);
      return file;
    } finally {
      try {
        compressor.free();
      } catch (e) {
        console.warn('[ChatArea] Failed to free compressor:', e);
      }
    }
  }, [wasm]);

  const handleSelectFiles = useCallback(async (files: File[]) => {
    console.log('[ChatArea] handleSelectFiles called:', files.length);
    if (!partnerId) {
      console.warn('[ChatArea] Cannot send files: No partnerId');
      return;
    }

    const rid = activeRoomId;
    const msgStore = useMessageStore.getState();

    // Process files sequentially to avoid chunk interleaved issues on the same data channel
    for (const file of files) {
      // Compress if it's an image
      const processedBlob = file.type.startsWith('image/') ? await compressImage(file) : file;
      const url = URL.createObjectURL(processedBlob);
      blobUrlsRef.current.add(url);
      const messageId = makeId();

      // Add local message for the image immediately so user sees progress
      if (rid) msgStore.addMessage(rid, {
        id: messageId,
        username: 'Me',
        avatarSeed: avatarSeed,
        timestamp: now(),
        content: `![image](${url})`,
        isVerified: isVerified,
        status: 'sending',
        progress: 0,
        isVanish: isVanishMode,
      });

      // Re-capture channel after potentially long compression yield
      let channel = fileTransferChannelRef.current;

      // If channel is null but we are connected, wait for it to be created
      if (!channel && connectionState === 'connected') {
        console.log('[ChatArea] DataChannel is null, waiting for initialization...');

        // Use the new helper function to wait for data channel with extended timeout
        const channelOpened = await waitForDataChannelOpen(partnerId, 20000);
        if (!channelOpened) {
          console.warn('[ChatArea] DataChannel failed to open within timeout');
          if (rid) msgStore.updateMessage(rid, messageId, (m) => ({
            ...m,
            status: 'error',
            content: 'Failed to send: P2P Connection timed out waiting for data channel.',
          }));
          continue;
        }

        channel = fileTransferChannelRef.current;
      }

      if (!channel || channel.readyState !== 'open') {
        console.warn('[ChatArea] DataChannel not ready for file transfer (final state:', channel?.readyState || 'null', ')');
        if (rid) msgStore.updateMessage(rid, messageId, (m) => ({
          ...m,
          status: 'error',
          content: 'Failed to send: P2P Connection not ready.',
        }));
        continue;
      }

      try {
        console.log('[ChatArea] Starting file send for:', file.name);
        // Conversion for the sendFile utility if it expects a File or just a Blob
        // Most sendFile utilities work with File or Blob since File inherits from Blob
        await sendFile(channel, processedBlob as File, isVanishMode, (p) => {
          // Update progress for this specific message
          if (rid) useMessageStore.getState().updateMessage(rid, messageId, (m) => ({ ...m, progress: p }));
        });

        // Mark as fully sent
        if (rid) msgStore.updateMessage(rid, messageId, (m) => ({ ...m, status: 'sent', progress: 100 }));
      } catch (err) {
        console.error('[ChatArea] File send failed:', err);
        if (rid) msgStore.updateMessage(rid, messageId, (m) => ({
          ...m,
          status: 'error',
          content: `Failed to send: ${err instanceof Error ? err.message : 'Unknown error'}`,
        }));
      }
    }
  }, [partnerId, isVerified, sendFile, compressImage, connectionState, isVanishMode, avatarSeed, activeRoomId]);

  // Log state transitions for debugging
  useEffect(() => {
    console.log(`[ChatArea] state transition: ${connectionState}, isMatching: ${isMatching}, hasMatch: ${!!matchData}`);
  }, [connectionState, isMatching, matchData]);

  // AUTO-START: If landing in chat area, begin searching automatically (ONCE)
  // But NOT if we have a roomId (reconnect mode — the room already exists)
  // Also skip auto-start in direct-connect mode (private/help/admin rooms)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (urlRoomId) return; // Reconnect mode — don't auto-search
    if (isDirectConnectMode) return; // Direct-connect mode — no matchmaker
    if (!hasAutoStarted.current && connectionState === 'idle' && !matchData && !isMatching) {
      hasAutoStarted.current = true;
      console.log('[ChatArea] Auto-starting search on mount');
      startSearching();
    }
    // Reset auto-start flag when transitioning from skipped state to idle
    if (hasAutoStarted.current && (connectionState === 'partner_skipped' || connectionState === 'self_skipped')) {
      hasAutoStarted.current = false;
      console.log('[ChatArea] Resetting auto-start flag after skip');
    }
  }, [connectionState, isMatching, matchData, urlRoomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DIRECT-CONNECT MODE ─────────────────────────────────────────────
  // For private/help/admin rooms: connect directly to the signaling room
  // without using the matchmaker. The room ID is derived from the roomType.
  const hasDirectConnected = useRef(false);
  useEffect(() => {
    if (!isDirectConnectMode || hasDirectConnected.current) return;
    hasDirectConnected.current = true;

    const state = useSessionStore.getState();
    const directRoomId = roomType === 'help'
      ? 'buzzu-help-channel'
      : roomType === 'admin'
        ? 'buzzu-admin-channel'
        : `private-${urlRoomId || 'unknown'}`;

    console.log(`[ChatArea] Direct-connect to ${roomType} room: ${directRoomId}`);
    setConnectionState('searching');

    // Small delay to let the signaling context mount
    const timer = setTimeout(() => {
      connectSignaling(directRoomId, state.peerId, {
        roomType: roomType!,
        roomKey: roomKey || undefined,
        accessKey: accessKey || undefined,
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isDirectConnectMode, roomType, urlRoomId, roomKey, accessKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // When signaling connects in direct-connect mode, transition to 'connected'
  useEffect(() => {
    if (!isDirectConnectMode) return;
    if (signalingConnected && connectionState === 'searching') {
      console.log('[ChatArea] Direct-connect: signaling connected, transitioning to connected');
      setConnectionState('connected');
      setIsSignalReady(true); // No E2E key exchange needed for group rooms
    }
  }, [isDirectConnectMode, signalingConnected, connectionState]);

  // ── RoomStatus handler ──────────────────────────────────────────────
  useEffect(() => {
    onRoomStatus((status, activePeers, maxPeers) => {
      console.log(`[ChatArea] RoomStatus: ${status}, peers: ${activePeers}/${maxPeers}`);
      setRoomStatus({ status, activePeers: activePeers ?? 0, maxPeers: maxPeers ?? 0 });
      if (status === 'waiting') {
        setConnectionState('waiting');
      } else if (status === 'admitted') {
        setConnectionState('connected');
        setIsSignalReady(true);
      }
    });
  }, [onRoomStatus]);

  // RECONNECT MODE: If we have a roomId from the URL, reconnect to the existing room
  // This fires when navigating back to /chat/new/:roomId after visiting a DM
  const hasReconnected = useRef(false);
  useEffect(() => {
    if (!urlRoomId || hasReconnected.current) return;

    // We need partner info from the store (persisted via localStorage)
    const state = useSessionStore.getState();
    if (state.currentRoomId !== urlRoomId || !state.partnerId) {
      console.log('[ChatArea] Reconnect: Room ID mismatch or no partner info, falling back to dashboard');
      navigate('/chat/new', { replace: true });
      return;
    }

    hasReconnected.current = true;
    console.log('[ChatArea] Reconnecting to room:', urlRoomId, 'partner:', state.partnerId);

    // Restore local component state from the persisted store
    setConnectionState('connected');
    setPartner({
      name: state.partnerName || funAnimalName(state.partnerId),
      avatarSeed: state.partnerAvatarSeed || state.partnerId,
    });

    // Reconnect signaling (no-op if already connected to same room)
    connectSignaling(urlRoomId, state.peerId);

    // Re-initiate WebRTC as the lower-ID peer.
    // Don't send the offer yet — wait for signaling to confirm the
    // partner is in the room (handled by a separate effect below).
    if (state.peerId < state.partnerId) {
      p2pInitRoomRef.current = urlRoomId;
    }

  }, [urlRoomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reconnect P2P offer — fires when partner joins room ──────────
  // Split from the main reconnect effect so the offer is only sent
  // after signaling confirms the partner is actually in the room.
  // Previously a blind 500ms setTimeout lost the initial offer when
  // the partner hadn't joined yet, triggering infinite TURN fallback.
  useEffect(() => {
    if (!urlRoomId || !hasReconnected.current || !signalingConnected) return;

    const state = useSessionStore.getState();
    if (!state.partnerId || p2pInitRoomRef.current !== urlRoomId) return;
    if (!(state.peerId < state.partnerId)) return;

    // Wait for partner to actually be in the room
    if (!peersInRoom.includes(state.partnerId)) return;

    // Guard: only send once per room
    if (p2pInitRoomRef.current === `done:${urlRoomId}`) return;
    p2pInitRoomRef.current = `done:${urlRoomId}`;

    const initReconnect = async () => {
      try {
        const pc = await createPeerConnection(state.partnerId!, undefined, true);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendOffer(state.partnerId!, offer);
        console.log('[ChatArea] Reconnect: WebRTC Offer sent to:', state.partnerId);
      } catch (err) {
        console.error('[ChatArea] Reconnect: P2P re-initiation failed:', err);
        p2pInitRoomRef.current = urlRoomId; // allow retry
      }
    };
    initReconnect();
  }, [urlRoomId, signalingConnected, peersInRoom, createPeerConnection, sendOffer]);

  // Reconnect key exchange — split into its own effect so it retries
  // when isCryptoReady flips to true (WASM may load after the main
  // reconnect effect has already fired).
  // Uses same robustness pattern as primary key exchange: wait for
  // signalingConnected AND partner in peersInRoom.
  useEffect(() => {
    if (!urlRoomId || !hasReconnected.current || !isCryptoReady || !signalingConnected) return;

    const state = useSessionStore.getState();
    if (!state.partnerId) return;

    // Wait for partner to be in the room before requesting keys
    if (!peersInRoom.includes(state.partnerId)) return;

    if (keyExchangeInitiatedRef.current === urlRoomId) {
      // Already initiated — set up a retry in case the messages were lost.
      const retryTimer = setTimeout(() => {
        if (isSignalReady) return;
        console.log('[ChatArea] Reconnect: Key exchange retry — isSignalReady still false after 4s');
        keyExchangeInitiatedRef.current = null; // allow next effect run to re-initiate
        isReconnectingRef.current = false;       // reset so it re-sets cleanly
        try {
          requestKeys(state.partnerId!);
        } catch (_) { /* ignore */ }
      }, 4000);
      return () => clearTimeout(retryTimer);
    }

    try {
      // Signal the onKeysResponse callback to bypass role enforcement.
      // See comment on isReconnectingRef declaration for full rationale.
      isReconnectingRef.current = true;
      const bundle = generatePreKeyBundle();
      publishKeys(bundle as any);
      // Both peers request keys for redundancy (role enforcement in callbacks)
      requestKeys(state.partnerId);
      keyExchangeInitiatedRef.current = urlRoomId;
      console.log('[ChatArea] Reconnect: Published keys & requested partner keys (isReconnecting=true)');
    } catch (err) {
      console.error('[ChatArea] Reconnect: Key exchange failed:', err);
      isReconnectingRef.current = false;
    }
  }, [urlRoomId, isCryptoReady, signalingConnected, peersInRoom, isSignalReady, generatePreKeyBundle, publishKeys, requestKeys]);


  // ── Data Channel Registration ──────────────────────────────────────
  // Separated from the match effect so it doesn't re-register on every
  // matchData/partner change. onDataChannel is a ref setter — last-writer-wins.
  useEffect(() => {
    console.log('[ChatArea] Registering onDataChannel callback');
    onDataChannel((channel, from) => {
      console.log('[ChatArea] onDataChannel callback triggered from:', from, 'label:', channel.label, 'state:', channel.readyState);
      if (channel.label === 'file-transfer') {
        fileTransferChannelRef.current = channel;

        // Use addEventListener instead of onopen/onclose/onerror so we don't
        // overwrite the handlers useWebRTC already set for dataChannelOpenStatesRef tracking.
        channel.addEventListener('open', () => {
          console.log('[ChatArea] File transfer channel OPEN via open event');
          fileTransferChannelRef.current = channel;
        });

        channel.addEventListener('message', (event) => {
          console.log('[ChatArea] Received data on channel:', typeof event.data);
          receiveChunk(event.data);
        });
        channel.addEventListener('close', () => {
          console.log('[ChatArea] File transfer channel CLOSED');
          fileTransferChannelRef.current = null;
        });
        channel.addEventListener('error', (err) => console.error('[ChatArea] File transfer channel ERROR:', err));
      }
    });
  }, [onDataChannel, receiveChunk]);

  useEffect(() => {
    if (matchData) {
      if (handledMatchId.current === matchData.room_id) {
        console.log('[ChatArea] Match already handled, skipping init:', matchData.room_id);
        return;
      }
      console.log('[ChatArea] Handling new match:', matchData.room_id);
      handledMatchId.current = matchData.room_id;
      keyExchangeInitiatedRef.current = null;

      const resolvedName = partnerName || funAnimalName(matchData.partner_id);
      const resolvedAvatarSeed = partnerAvatarSeed || matchData.partner_id;

      setConnectionState('connected');
      setPartner({ name: resolvedName, avatarSeed: resolvedAvatarSeed });

      // Persist match state in the store — Header, SidebarList, and useWebRTC
      // all read from the store to show @partnerName and preserve connections.
      joinRoom(
        matchData.room_id,
        matchData.partner_id,
        matchData.partner_is_verified ?? false,
        resolvedName,
        resolvedAvatarSeed,
      );

      // Update the URL to include the roomId — gives the chat its own URL
      // so navigating away and back reconnects instead of starting a new search
      navigate(`/chat/new/${matchData.room_id}`, { replace: true });

      signalingTimeoutRef.current = setTimeout(() => {
        connectSignaling(matchData.room_id, matchData.peer_id);
        signalingTimeoutRef.current = null;
      }, 50);

      // Signal key exchange is now handled by a dedicated reactive effect below

      // Move P2P initiation logic to a dedicated reactive effect below
    } else {
      // In reconnect mode (urlRoomId present), matchData is null because the
      // useMatching hook was freshly mounted — the reconnect effect handles
      // restoring state, so skip the idle reset entirely.
      if (urlRoomId) return;

      handledMatchId.current = null;
      keyExchangeInitiatedRef.current = null;
      // Don't reset if we are currently searching or in skipped view
      setConnectionState((prev) => {
        if (prev === 'partner_skipped' || isMatching) return prev;
        return 'idle';
      });
      if (!isMatching) {
        setPartner(null);
        // Only clear if we are NOT in a state where a P2P connection might still be lingering/closing
        // Use a timeout to avoid race conditions with state updates
        setTimeout(() => {
          if (isMountedRef.current) {
            fileTransferChannelRef.current = null;
          }
        }, 100);
      }
    }
  }, [matchData, partnerName, partnerAvatarSeed, connectSignaling, isCryptoReady, generatePreKeyBundle, publishKeys, requestKeys, isMatching]);

  useEffect(() => {
    if (matchData && signalingConnected && peerId && matchData.partner_id) {
      if (peerId < matchData.partner_id) {
        const roomId = matchData.room_id;
        // Check if we already initiated for this ROOM (ref-based, resets with new match)
        if (p2pInitRoomRef.current === roomId) return;
        p2pInitRoomRef.current = roomId;

        console.log('[ChatArea] Reactive P2P Initiation for room:', roomId);
        const initiate = async () => {
          try {
            const pc = await createPeerConnection(matchData.partner_id, undefined, true);

            // DO NOT override pc.onconnectionstatechange / pc.oniceconnectionstatechange
            // — the handlers set by createPeerConnection contain critical logic
            // (ICE restart backoff, intentional leave guards, sender tuning).

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendOffer(matchData.partner_id, offer);
            console.log('[ChatArea] WebRTC Offer sent to:', matchData.partner_id);

            // If screen sharing was active before skip, reattach to
            // the new PC (tunes senders, wires ended listener, starts stats).
            // Tracks were already added by createPeerConnectionWrapper, so
            // reattachToPC only handles tuning and lifecycle hooks.
            if (isLocalScreenSharing) {
              const reattached = await reattachScreenShare(
                pc,
                (o) => sendOffer(matchData.partner_id, o),
              );
              if (reattached) {
                console.log('[ChatArea] Screen share reattached to new PC for:', matchData.partner_id);
              }
            }
          } catch (err) {
            console.error('[ChatArea] Reactive P2P Initiation failed:', err);
            p2pInitRoomRef.current = null; // Allow retry
          }
        };

        // Use a non-cancellable timeout — the ref guard prevents double-initiation,
        // and returning a cleanup was causing the timer to be killed on effect re-runs.
        p2pInitTimerRef.current = setTimeout(initiate, 500);
      }
    }
  }, [matchData, signalingConnected, peerId, createPeerConnection, sendOffer, isLocalScreenSharing, reattachScreenShare]);

  // ── Screen Share: Auto-resume after new match ─────────────────────
  // If local screen sharing was active before the skip/leave:
  //   1. Notify the new partner via signaling (ScreenShare=true)
  //   2. Reattach to the new PC (tune senders, wire ended listener, stats)
  // The tracks are already re-added to the PC by createPeerConnectionWrapper.
  const screenShareResumedForRoom = useRef<string | null>(null);
  useEffect(() => {
    if (!matchData || !signalingConnected || !isLocalScreenSharing) return;
    // Only send once per room
    if (screenShareResumedForRoom.current === matchData.room_id) return;
    screenShareResumedForRoom.current = matchData.room_id;

    console.log('[ChatArea] Auto-resuming screen share signal for new partner:', matchData.partner_id);

    // Reattach to new PC (handles both initiator and responder).
    // Uses a delay to ensure the PC exists (responder gets it via handleOffer).
    const timer = setTimeout(async () => {
      const pc = getPeerConnection(matchData.partner_id);
      if (pc && pc.signalingState !== 'closed') {
        const reattached = await reattachScreenShare(
          pc,
          (o) => sendOffer(matchData.partner_id, o),
        );
        if (reattached) {
          console.log('[ChatArea] Screen share reattached (auto-resume) for:', matchData.partner_id);
        }
      }
      // Signal the new partner that we're screen sharing
      sendScreenShareState(matchData.partner_id, true);

      // Reattach mic if the stream exists (even if currently soft-muted)
      const voiceState = useVoiceChatStore.getState();
      if (voiceState.localAudioStream) {
        const micReattached = await reattachVoiceChat(
          pc,
          (o) => sendOffer(matchData.partner_id, o),
        );
        if (micReattached) {
          console.log('[ChatArea] Mic reattached (auto-resume) for:', matchData.partner_id);
          sendVoiceChatState(matchData.partner_id, voiceState.isMicOn);
        }
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [matchData, signalingConnected, isLocalScreenSharing, sendScreenShareState, isMicOn, sendVoiceChatState, getPeerConnection, reattachScreenShare, reattachVoiceChat, sendOffer]);

  // Dedicated Signal Key Exchange Effect
  // TIMING FIX: Wait for signalingConnected AND partner in peersInRoom.
  // Without this, RequestKeys is queued → flushed before the responder connects
  // → server silently drops it → key exchange never completes.
  //
  // BOTH peers publish keys AND request keys for redundancy. The role
  // enforcement in onKeysResponse / onHandshake callbacks ensures only the
  // correct peer (initiator vs responder) processes each message.
  useEffect(() => {
    if (!matchData || !isCryptoReady || !signalingConnected || isSignalReady) return;

    const partnerInRoom = peersInRoom.includes(matchData.partner_id);
    if (!partnerInRoom) {
      console.log('[ChatArea] [Signal Debug] Waiting for partner to join room before key exchange');
      return;
    }

    if (keyExchangeInitiatedRef.current === matchData.room_id) {
      // Already initiated — set up a retry in case the messages were lost.
      const retryTimer = setTimeout(() => {
        if (isSignalReady) return;
        console.log('[ChatArea] [Signal Debug] Key exchange retry — isSignalReady still false after 3s');
        keyExchangeInitiatedRef.current = null; // Allow the next effect run to re-initiate
        // Force a re-run by requesting keys again (the effect won't re-fire on ref
        // change alone, but the requestKeys send itself will succeed or fail fast).
        try {
          requestKeys(matchData.partner_id);
        } catch (_) { /* ignore */ }
      }, 3000);
      return () => clearTimeout(retryTimer);
    }

    const isInitiator = peerId < matchData.partner_id;
    console.log('[ChatArea] [Signal Debug] Key exchange start: partner in room ✓, signalingConnected ✓, isInitiator:', isInitiator);

    try {
      const bundle = generatePreKeyBundle();
      publishKeys(bundle as any);
      // BOTH peers request keys — redundancy in case one direction's message is lost.
      requestKeys(matchData.partner_id);
      keyExchangeInitiatedRef.current = matchData.room_id;
      console.log('[ChatArea] [Signal Debug]', isInitiator ? '[Initiator]' : '[Responder]', 'Published keys & requested partner keys');
    } catch (err) {
      console.error('[ChatArea] [Signal Debug] Error during key exchange:', err);
    }
  }, [matchData, isCryptoReady, signalingConnected, peersInRoom, isSignalReady, generatePreKeyBundle, publishKeys, requestKeys, peerId]);

  return (
    <main className="w-full max-w-full flex h-full flex-grow flex-col overflow-hidden bg-background relative min-w-0">
      <div className="flex w-full h-full overflow-hidden min-w-0">
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <div className="flex-grow overflow-hidden flex flex-col min-w-0 relative">
            {/* Direct-connect room header */}
            {isDirectConnectMode && connectionState === 'connected' && (
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel/80 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brightness capitalize">
                    {roomType === 'help' ? '💬 Help Channel' : roomType === 'admin' ? '🛡️ Admin Channel' : `🔒 ${urlRoomId || 'Private Room'}`}
                  </span>
                  {roomStatus && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {roomStatus.activePeers}/{roomStatus.maxPeers} online
                    </span>
                  )}
                  {peersInRoom.length > 0 && !roomStatus && (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                      {peersInRoom.length + 1} online
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPeerListOpen(!isPeerListOpen)}
                    className={`text-xs px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isPeerListOpen ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'}`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Peers</span>
                  </button>
                  <button
                    onClick={() => { disconnectSignaling(); onLeaveRoom?.(); }}
                    className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    Leave
                  </button>
                </div>
              </div>
            )}

            {connectionState === 'waiting' ? (
              <div className="flex-grow flex items-center justify-center flex-col gap-6 animate-in fade-in duration-500 px-4 text-center">
                <div className="w-20 h-20 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-amber-500/20 rounded-full animate-ping" />
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-brightness mb-1">Room is Full</h3>
                  <p className="text-sm text-muted-foreground">
                    You're in the waiting queue. You'll be admitted when a spot opens.
                  </p>
                  {roomStatus && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {roomStatus.activePeers}/{roomStatus.maxPeers} members online
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { disconnectSignaling(); onLeaveRoom?.(); }}
                  className="text-sm text-red-400 hover:text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/10 transition-colors border border-red-500/20"
                >
                  Leave Queue
                </button>
              </div>
            ) : connectionState === 'searching' ? (
              <div className="flex-grow flex items-center justify-center flex-col gap-8 animate-in fade-in duration-500">
                <div className="w-24 h-24 relative flex items-center justify-center">
                  <svg
                    className="w-full h-full animate-logo-breathe"
                    viewBox="-2.4 -2.4 28.80 28.80"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill="#FFD700"
                      d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835 0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84 0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84 0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84 0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84.00 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z"
                    />
                  </svg>
                </div>
              </div>
            ) : connectionState === 'idle' ? (
              <div className="flex-grow flex items-center justify-center flex-col gap-2">
                <p className="text-muted-foreground text-sm">Click START to begin chatting</p>
              </div>
            ) : connectionState === 'partner_skipped' || connectionState === 'self_skipped' ? (
              <div className="flex-grow overflow-y-auto chat-scrollbar">
                <PartnerSkippedView
                  onReport={() => {
                    setIsReportModalOpen(true);
                  }}
                  onGetPremium={() => console.log('Premium clicked')}
                  isSelfSkip={connectionState === 'self_skipped'}
                />
              </div>
            ) : (
              <>
                <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: 'none' }} />

                {isTheaterMode ? (
                  <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2 lg:gap-4 px-2 lg:px-4 pb-2 lg:pb-4">
                    <div className="relative w-full flex-none aspect-video max-h-[60vh] lg:flex-1 lg:aspect-auto lg:max-h-none min-h-[200px] lg:min-h-0">
                      <ScreenShareViewer
                        stream={remoteScreenStream!}
                        label={partner?.name || 'Partner'}
                        onClose={() => useScreenShareStore.getState().clearRemoteSharing()}
                        pc={getPeerConnection(useSessionStore.getState().partnerId ?? '') ?? null}
                        layout="theater"
                      />
                      {isLocalScreenSharing && localScreenStream && (
                        <ScreenShareViewer
                          stream={localScreenStream}
                          label="You"
                          isLocal
                          onClose={() => useScreenShareStore.getState().requestStop()}
                        />
                      )}
                    </div>
                    <div className="flex flex-col min-h-0 lg:flex-none lg:w-[360px] xl:w-[420px] bg-panel/70 rounded-2xl overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                      <div className="flex items-center justify-between px-4 py-3 bg-panel/80">
                        <div className="flex flex-col">
                          <span className="text-sm font-semibold text-foreground">{partner?.name || 'Chat'}</span>
                          <span className="text-[11px] text-muted-foreground">{isPartnerTyping ? 'Typing…' : 'Messages'}</span>
                        </div>
                        <span className="text-[11px] text-emerald-400/90">{isSignalReady && isCryptoReady ? 'Encrypted' : 'Connecting'}</span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden bg-panel/50">
                        <MessageList
                          messages={messages}
                          partnerName={partner?.name || 'Partner'}
                          onReply={handleReply}
                          onEdit={handleEdit}
                          onReport={handleReport}
                          onDelete={handleDelete}
                          highlightedMessageId={null}
                          editingMessageId={editingMessageId}
                          onSaveEdit={handleSaveEdit}
                          onCancelEdit={handleCancelEdit}
                          onProfileClick={handleProfileClick}
                          partnerIsVerified={partnerIsVerified}
                          isSignalReady={isSignalReady}
                          isCryptoReady={isCryptoReady}
                          onVanishOpen={handleVanishOpen}
                          hideIntro={isDirectConnectMode}
                        />
                      </div>
                      <div className="bg-panel/80">
                        <MessageInput
                          replyingTo={replyingTo}
                          editingMessage={editingMessage}
                          onCancelReply={() => setReplyingTo(null)}
                          onCancelEdit={() => setEditingMessage(null)}
                          connectionState={connectionState}
                          onStart={handleStart}
                          onStop={handleStop}
                          onSkip={handleSkip}
                          onSend={handleSendMessage}
                          isPartnerTyping={isPartnerTyping}
                          partnerName={partner?.name || 'Stranger'}
                          onTyping={handleTyping}
                          onSelectFiles={handleSelectFiles}
                          isGifPickerOpen={isGifPickerOpen}
                          onToggleGifPicker={() => setIsGifPickerOpen(prev => !prev)}
                          onCloseGifPicker={() => setIsGifPickerOpen(false)}
                          isVanishMode={isVanishMode}
                          onToggleVanishMode={() => setIsVanishMode(prev => !prev)}
                          isDirectConnectMode={isDirectConnectMode}
                          isCompactGifPicker={true}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {isRemoteSharing && remoteScreenStream && (
                      <ScreenShareViewer
                        stream={remoteScreenStream}
                        label={partner?.name || 'Partner'}
                        onClose={() => useScreenShareStore.getState().clearRemoteSharing()}
                        pc={getPeerConnection(useSessionStore.getState().partnerId ?? '') ?? null}
                      />
                    )}
                    {isLocalScreenSharing && localScreenStream && (
                      <ScreenShareViewer
                        stream={localScreenStream}
                        label="You"
                        isLocal
                        onClose={() => useScreenShareStore.getState().requestStop()}
                      />
                    )}
                    <MessageList
                      messages={messages}
                      partnerName={partner?.name || 'Partner'}
                      onReply={handleReply}
                      onEdit={handleEdit}
                      onReport={handleReport}
                      onDelete={handleDelete}
                      highlightedMessageId={null}
                      editingMessageId={editingMessageId}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                      onProfileClick={handleProfileClick}
                      partnerIsVerified={partnerIsVerified}
                      isSignalReady={isSignalReady}
                      isCryptoReady={isCryptoReady}
                      onVanishOpen={handleVanishOpen}
                      hideIntro={isDirectConnectMode}
                    />
                  </>
                )}
              </>
            )}
          </div>

          {!isTheaterMode && (
            <MessageInput
              replyingTo={replyingTo}
              editingMessage={editingMessage}
              onCancelReply={() => setReplyingTo(null)}
              onCancelEdit={() => setEditingMessage(null)}
              connectionState={connectionState}
              onStart={handleStart}
              onStop={handleStop}
              onSkip={handleSkip}
              onSend={handleSendMessage}
              isPartnerTyping={isPartnerTyping}
              partnerName={partner?.name || 'Stranger'}
              onTyping={handleTyping}
              onSelectFiles={handleSelectFiles}
              isGifPickerOpen={isGifPickerOpen}
              onToggleGifPicker={() => setIsGifPickerOpen(prev => !prev)}
              onCloseGifPicker={() => setIsGifPickerOpen(false)}
              isVanishMode={isVanishMode}
              onToggleVanishMode={() => setIsVanishMode(prev => !prev)}
              isDirectConnectMode={isDirectConnectMode}
              isCompactGifPicker={false}
            />
          )}
        </div>

        {/* Desktop Peer List */}
        {isDirectConnectMode && connectionState === 'connected' && isPeerListOpen && (
          <PeerListPanel peersInRoom={peersInRoom} onClose={() => setIsPeerListOpen(false)} isMobile={false} />
        )}

        {/* Mobile Peer List Overlay */}
        {isDirectConnectMode && connectionState === 'connected' && isPeerListOpen && (
          <>
            <div className="fixed inset-0 bg-background/50 z-40 md:hidden animate-in fade-in" onClick={() => setIsPeerListOpen(false)}></div>
            <PeerListPanel peersInRoom={peersInRoom} onClose={() => setIsPeerListOpen(false)} isMobile={true} />
          </>
        )}
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        message={messageToReport}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        username={selectedProfile?.username || ''}
        avatarSeed={selectedProfile?.avatarSeed || ''}
        avatarUrl={selectedProfile?.avatarUrl || null}
        isVerified={selectedProfile?.isVerified}
        onAddFriend={() => handleAddFriend(partnerId || '', selectedProfile?.username || '', selectedProfile?.avatarSeed || '')}
        onAcceptFriend={() => handleAcceptFriendRequest(partnerId || '')}
        onDeclineFriend={() => handleDeclineFriendRequest(partnerId || '')}
        requestStatus={partnerId ? getFriendRequestStatus(partnerId) : 'none'}
      />
    </main >
  );
}
