import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { GifPicker } from "./GifPicker";
import { ReportModal } from "./ReportModal";
import { ProfileModal } from "./ProfileModal";
import { PartnerSkippedView } from "./PartnerSkippedView";
import { Message } from "./types";
import { Users, X } from "lucide-react";
import { useMatching } from "../../hooks/useMatching";
import { useSignaling } from "../../hooks/useSignaling";
import { useWebRTC } from "../../hooks/useWebRTC";
import { useCrypto } from "../../hooks/useCrypto";
import { useFileTransfer } from "../../hooks/useFileTransfer";
import { useScreenShare } from "../../hooks/useScreenShare";
import { useVoiceChat } from "../../hooks/useVoiceChat";
import { useConnectionResilience } from "../../hooks/useConnectionResilience";
import { useAutoCleanup } from "../../hooks/useAutoCleanup";
import { useSessionStore } from "../../stores/sessionStore";
import { useMessageStore, EMPTY_MESSAGES } from "../../stores/messageStore";
import { useScreenShareStore } from "../../stores/screenShareStore";
import { useVoiceChatStore } from "../../stores/voiceChatStore";
import { ScreenShareViewer } from "./ScreenShareViewer";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { reportUser } from "../../utils/reputationUtils";
import { funAnimalName } from "fun-animal-names";
import { useWasm } from "../../hooks/useWasm";
import { usePeerStatus } from "../../hooks/usePeerStatus";
import { shouldMarkSignalReady } from "./chatEncryptionState";
import {
  createSafeSessionStorage,
  parseDataChannelControlMessage,
  toEncryptedBytes,
  type IncomingChatMessage,
} from "./chatAreaRuntime";
import { fingerprintValue, traceE2E } from "../../utils/e2eTrace";

function now() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function makeId() {
  return Date.now().toString() + Math.random().toString(36).slice(2);
}

const SUPPRESS_AUTO_START_ONCE_KEY = "buzzu:suppress-chat-autostart-once";
const SKIP_VIEW_STATE_KEY = "buzzu:skip-view-state";
const MAX_CACHED_IMAGE_DATA_URLS = 160;
const MESSAGE_CACHE_PERSIST_DEBOUNCE_MS = 450;
const MESSAGE_SIGNAL_FALLBACK_DELAY_MS = 600;
const MESSAGE_P2P_OPEN_WAIT_MS = 350;
const MESSAGE_SIGNAL_FALLBACK_DELAY_WHEN_P2P_HEALTHY_MS = 2500;
const P2P_PROBE_TIMEOUT_MS = 1500;
const PARTNER_RECONNECT_GRACE_MS = 8000;
const ENCRYPTED_MESSAGE_DEDUPE_TTL_MS = 180000;
const KEY_EXCHANGE_RESPONDER_FALLBACK_GATE_MS = 2200;
const safeSessionStorage = createSafeSessionStorage(
  typeof window !== "undefined" ? window.sessionStorage : undefined,
);

export type RoomType = "match" | "private" | "help" | "admin";

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
  isMobile,
}: {
  peersInRoom: string[];
  onClose: () => void;
  isMobile: boolean;
}) {
  const avatarSeed = useSessionStore((state) => state.avatarSeed);
  const avatarUrl = useSessionStore((state) => state.avatarUrl);

  const renderAvatar = (seed: string, url?: string | null) => (
    <img
      src={
        url ||
        `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${seed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`
      }
      className="w-8 h-8 rounded-full bg-muted shrink-0"
      alt="Avatar"
    />
  );

  return (
    <div
      className={`border-l border-border bg-panel flex flex-col shrink-0 overflow-hidden ${isMobile ? "absolute inset-y-0 right-0 w-64 lg:w-72 z-50 shadow-2xl animate-in slide-in-from-right-8 duration-200" : "hidden md:flex w-64 lg:w-72 bg-panel/30"}`}
    >
      <div className="px-4 py-3 border-b border-border font-semibold text-sm flex justify-between items-center text-foreground shrink-0">
        <span>Online — {peersInRoom.length + 1}</span>
        {isMobile && (
          <button
            className="p-1 rounded-md hover:bg-white/10 transition-colors"
            onClick={onClose}
            aria-label="Close peer list"
          >
            <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 chat-scrollbar">
        {/* You */}
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer">
          {renderAvatar(avatarSeed, avatarUrl)}
          <span className="text-sm font-medium truncate text-foreground flex-1">
            You
          </span>
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            Me
          </span>
        </div>

        {/* Others */}
        {peersInRoom.map((pId) => {
          const pName = funAnimalName(pId);
          return (
            <div
              key={pId}
              className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors cursor-pointer mt-1"
            >
              {renderAvatar(pId)}
              <span className="text-sm font-medium truncate text-muted-foreground hover:text-foreground transition-colors">
                {pName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ChatArea({
  roomId: urlRoomId,
  roomType,
  roomKey,
  accessKey,
  onLeaveRoom,
}: ChatAreaProps) {
  const isDev = import.meta.env.DEV;
  const devLog = useCallback((...args: unknown[]) => {
    if (isDev) {
      console.log(...args);
    }
  }, [isDev]);
  const devWarn = useCallback((...args: unknown[]) => {
    if (isDev) {
      console.warn(...args);
    }
  }, [isDev]);
  const isDirectConnectMode = roomType && roomType !== "match";
  const navigate = useNavigate();
  const initialSkipState =
    typeof sessionStorage !== "undefined"
      ? safeSessionStorage.getItem(SKIP_VIEW_STATE_KEY)
      : null;
  const [connectionState, setConnectionState] = useState<
    | "idle"
    | "searching"
    | "connected"
    | "partner_skipped"
    | "self_skipped"
    | "waiting"
  >(
    initialSkipState === "partner"
      ? "partner_skipped"
      : initialSkipState === "self"
        ? "self_skipped"
        : urlRoomId
          ? "connected"
          : "idle",
  );
  const [partner, setPartner] = useState<{
    name: string;
    avatarSeed: string;
  } | null>(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [isSignalReady, setIsSignalReady] = useState(false);
  const [isVanishMode, setIsVanishMode] = useState(false);
  const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<{
    peerId: string;
    username: string;
    avatarSeed: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    interests?: string[];
    interestsVisibility?: "Everyone" | "Friends" | "Nobody";
    badgeVisibility?: "Everyone" | "Friends" | "Nobody";
    joinedAt?: string | null;
  } | null>(null);
  const [peerProfileMeta, setPeerProfileMeta] = useState<
    Record<
      string,
      {
        interests?: string[];
        interestsVisibility?: "Everyone" | "Friends" | "Nobody";
        badgeVisibility?: "Everyone" | "Friends" | "Nobody";
        joinedAt?: string | null;
      }
    >
  >({});
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [messageToReport, setMessageToReport] = useState<Message | null>(null);
  const [roomStatus, setRoomStatus] = useState<{
    status: string;
    activePeers: number;
    maxPeers: number;
  } | null>(null);
  const [isPeerListOpen, setIsPeerListOpen] = useState(false);

  const handledMatchId = useRef(null);
  const keyExchangeInitiatedRef = useRef<string | null>(null);
  // Tracks reconnect cycles to gate retries and reset flow state.
  const isReconnectingRef = useRef(false);
  const p2pInitRoomRef = useRef<string | null>(null);
  const p2pInitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── P2P Asynchronous Initiation Lock (Mutex) ──
  // Prevents multiple independent React effects (e.g. onPeerJoin + matchData
  // updates) from simultaneously spawning WebRTC PCs and firing
  // duplicate Offers to the signaling server for the same peer.
  const p2pInFlightRef = useRef<Set<string>>(new Set());

  const pendingLeavePeerRef = useRef<string | null>(null);
  const partnerLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partnerSkipIntentRef = useRef<Set<string>>(new Set());
  const partnerSkipHandledRef = useRef(false);
  const fileTransferChannelRef = useRef<RTCDataChannel | null>(null);
  const wiredFileTransferChannelsRef = useRef<WeakSet<RTCDataChannel>>(
    new WeakSet(),
  );
  const dataChannelTeardownRef = useRef<Map<RTCDataChannel, () => void>>(
    new Map(),
  );
  const signalingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const selfSkipFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isMountedRef = useRef(true);
  const blobUrlsRef = useRef<Set<string>>(new Set());
  const screenShareRetryRef = useRef<Map<string, number>>(new Map());
  const screenShareStartInFlightRef = useRef(false);
  const pendingEncryptedMessagesRef = useRef<
    Map<string, { message: IncomingChatMessage; from: string; receivedAt: number }>
  >(new Map());
  const pendingDecryptFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const persistMessagesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastEncryptionRecoveryAtRef = useRef<Map<string, number>>(new Map());
  const lastKeysRequestResponseAtRef = useRef<Map<string, number>>(new Map());
  const lastKeysResponseHandledAtRef = useRef<Map<string, number>>(new Map());
  const lastHandshakeHandledAtRef = useRef<Map<string, number>>(new Map());
  const decryptInFlightRef = useRef<Set<string>>(new Set());
  const recentlyHandledEncryptedRef = useRef<Map<string, number>>(new Map());
  const ackedOutgoingMessagesRef = useRef<Set<string>>(new Set());
  const pendingSignalFallbackTimersRef = useRef<
    Map<string, ReturnType<typeof setTimeout>>
  >(new Map());
  const p2pHealthyPeersRef = useRef<Map<string, { lastAckAt: number; rttMs: number }>>(
    new Map(),
  );
  const pendingP2PProbeRef = useRef<Map<string, { peerId: string; sentAt: number }>>(
    new Map(),
  );
  const p2pProbeTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const pendingKeysRequestRef = useRef<Set<string>>(new Set());
  const pendingKeysResponseRef = useRef<Map<string, string>>(new Map());
  const pendingHandshakeRef = useRef<Map<string, string>>(new Map());
  const keyExchangeEpochRef = useRef<Map<string, number>>(new Map());
  const keyExchangeModeRef = useRef<Map<string, "normal" | "reconnect">>(
    new Map(),
  );
  const responderFallbackEligibleAtRef = useRef<Map<string, number>>(new Map());
  const processedKeyPayloadFpRef = useRef<Map<string, string>>(new Map());
  const lastTypingSignalRef = useRef<Map<string, { value: boolean; ts: number }>>(
    new Map(),
  );

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
    sendChatMessage: sendChatMessageSignaling,
    sendTypingState,
    publishKeys,
    requestKeys,
    sendKeysResponse,
    sendHandshake,
    sendFriendRequest: sendFriendRequestSignaling,
    sendScreenShareState,
    onPeerJoin,
    onChatMessage,
    onTyping,
    onPeerLeave,
    onPeerSkip,
    onKeysRequest,
    onKeysResponse,
    onHandshake,
    onFriendRequest,
    onScreenShare,
    sendVoiceChatState,
    sendSkip,
    onVoiceChat,
    sendProfileUpdate,
    onProfile,
    onRoomStatus,
    remoteStream,
    error: signalingError,
  } = useSignaling();

  const { wasm } = useWasm();

  const {
    isReady: isCryptoReady,
    signalSessionVersion,
    generatePreKeyBundle,
    initiateSignalSession,
    respondToSignalSession,
    encryptMessage,
    decryptMessage,
    hasSignalSession,
    clearSignalSessions,
    clearSignalSession,
  } = useCrypto();

  const {
    onDataChannel,
    createPeerConnection,
    isDataChannelOpen,
    waitForDataChannelOpen,
    closePeerConnection,
    closeAllPeerConnections,
    getPeerConnection,
    getPeerConnections,
    getOpenDataChannels,
    applyTurnFallback,
    isFallbackActive,
    getConnectionState,
    requestRenegotiation,
  } = useWebRTC();

  // ── Screen Share ─────────────────────────────────────────────────
  const {
    startScreenShare,
    stopScreenShare,
    isSharing: isLocalScreenSharing,
    screenStream: localScreenStream,
    onStopped: onScreenShareStopped,
    detachFromPC: detachScreenShare,
    forceStopCapture: forceStopScreenCapture,
    reattachToPC: reattachScreenShare,
    adaptiveBitrateEnabled,
    setAdaptiveBitrateEnabled,
    adaptiveBitrateStats,
  } = useScreenShare();
  const {
    pendingAction: screenSharePendingAction,
    clearPendingAction: clearScreenShareAction,
    setLocalSharing,
    clearLocalSharing,
    isRemoteSharing,
    remoteStream: remoteScreenStream,
    remoteStreamVersion,
    reset: resetScreenShareStore,
    resetRemoteOnly: resetRemoteScreenShare,
  } = useScreenShareStore();
  const hasRemoteTheaterShare = isRemoteSharing && !!remoteScreenStream;
  const hasLocalTheaterShare = isLocalScreenSharing && !!localScreenStream;
  const isTheaterMode = hasRemoteTheaterShare || hasLocalTheaterShare;
  const theaterStreams = [
    ...(hasRemoteTheaterShare && remoteScreenStream
      ? [
          {
            id: "remote",
            stream: remoteScreenStream,
            label: partner?.name || "Partner",
            isLocal: false,
            key: `remote-${remoteStreamVersion}`,
          },
        ]
      : []),
    ...(hasLocalTheaterShare && localScreenStream
      ? [
          {
            id: "local",
            stream: localScreenStream,
            label: "You",
            isLocal: true,
            key: `local-${localScreenStream.id}`,
          },
        ]
      : []),
  ];
  const hasDualTheaterStreams = theaterStreams.length > 1;
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  // ── Voice Chat ──────────────────────────────────────────────────
  const {
    startMic,
    stopMic,
    detachFromPC: detachVoiceChat,
    forceStopMic,
    reattachToPC: reattachVoiceChat,
  } = useVoiceChat();
  const {
    pendingAction: voicePendingAction,
    clearPendingAction: clearVoiceAction,
    isMicOn,
    isPartnerMicOn,
    setPartnerMicOn,
    reset: resetVoiceChatStore,
    setMicOff,
  } = useVoiceChatStore();
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const incomingMessageAudioRef = useRef<HTMLAudioElement | null>(null);
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
    getConnectionState,
    isInChat: connectionState === "connected",
  });

  const cleanupAudioGraph = useCallback(() => {
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (_) { }
      audioSourceRef.current = null;
    }
    if (audioGainRef.current) {
      try {
        audioGainRef.current.disconnect();
      } catch (_) { }
      audioGainRef.current = null;
    }
    if (audioCompressorRef.current) {
      try {
        audioCompressorRef.current.disconnect();
      } catch (_) { }
      audioCompressorRef.current = null;
    }
    if (audioHighPassRef.current) {
      try {
        audioHighPassRef.current.disconnect();
      } catch (_) { }
      audioHighPassRef.current = null;
    }
    if (audioLowPassRef.current) {
      try {
        audioLowPassRef.current.disconnect();
      } catch (_) { }
      audioLowPassRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (_) { }
      audioContextRef.current = null;
    }
    audioStreamIdRef.current = null;
  }, []);

  const cleanupBlobUrls = useCallback(() => {
    blobUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {
        /* already revoked */
      }
    });
    blobUrlsRef.current.clear();
  }, []);

  // Track isCryptoReady state for debugging
  useEffect(() => {
    devLog(
      "[ChatArea] [Signal Debug] isCryptoReady changed:",
      isCryptoReady,
    );
  }, [isCryptoReady, devLog]);

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
      if (selfSkipFinalizeTimerRef.current) {
        clearTimeout(selfSkipFinalizeTimerRef.current);
        selfSkipFinalizeTimerRef.current = null;
      }
      if (partnerLeaveTimerRef.current) {
        clearTimeout(partnerLeaveTimerRef.current);
        partnerLeaveTimerRef.current = null;
      }
      if (persistMessagesTimerRef.current) {
        clearTimeout(persistMessagesTimerRef.current);
        persistMessagesTimerRef.current = null;
      }
      // Revoke all blob URLs to prevent memory leaks
      cleanupBlobUrls();
      cleanupAudioGraph();
    };
  }, [cleanupBlobUrls, cleanupAudioGraph]);

  // ── Bug Fix: Resume AudioContext + audio element when tab becomes visible ──
  // Browsers suspend AudioContext and may pause <audio> elements when the tab
  // is hidden. The one-shot click/touch listeners added during stream setup
  // only fire once and don't re-arm after a subsequent tab-switch. This
  // persistent visibilitychange listener resumes playback every time the user
  // returns to the tab — zero overhead when audio is already running.
  useEffect(() => {
    incomingMessageAudioRef.current = new Audio("/sounds/message.mp3");
    return () => {
      incomingMessageAudioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;

      // Resume Web Audio pipeline (voice processing graph)
      if (
        audioContextRef.current &&
        audioContextRef.current.state === "suspended"
      ) {
        audioContextRef.current.resume().catch(() => { });
      }

      // Restart the HTMLAudioElement if it stalled (autoplay policy or OS audio focus)
      if (
        remoteAudioRef.current &&
        remoteAudioRef.current.paused &&
        remoteAudioRef.current.srcObject
      ) {
        remoteAudioRef.current.play().catch(() => { });
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, []); // refs only — never stale; no deps needed

  // ── Screen Share: Handle pending actions from Sidebar button ──────
  useEffect(() => {
    if (!screenSharePendingAction) return;

    if (screenSharePendingAction === "stop") {
      screenShareRetryRef.current.delete(useSessionStore.getState().partnerId ?? "");
      forceStopScreenCapture();
      clearLocalSharing();
      clearScreenShareAction();

      const currentPartnerId = useSessionStore.getState().partnerId;
      if (currentPartnerId) {
        const pc = getPeerConnection(currentPartnerId);
        if (pc) {
          stopScreenShare(pc, () =>
            requestRenegotiation(currentPartnerId, "screen-share-stop"),
          );
        }
        sendScreenShareState(currentPartnerId, false);
      }
      return;
    }

    const currentPartnerId = useSessionStore.getState().partnerId;
    if (!currentPartnerId) {
      clearScreenShareAction();
      return;
    }

    const pc = getPeerConnection(currentPartnerId);
    if (!pc) {
      const attempts = screenShareRetryRef.current.get(currentPartnerId) ?? 0;
      if (attempts < 5) {
        screenShareRetryRef.current.set(currentPartnerId, attempts + 1);
        clearScreenShareAction();
        const shouldOffer = !!peerId && peerId < currentPartnerId;
        createPeerConnection(currentPartnerId, undefined, shouldOffer)
          .catch((err) => {
            console.warn("[ChatArea] Screen share: Failed to create PC", err);
          })
          .finally(() => {
            setTimeout(() => {
              const state = useSessionStore.getState();
              if (state.partnerId === currentPartnerId) {
                useScreenShareStore.getState().requestStart();
              }
            }, 300);
          });
        return;
      }
      console.warn("[ChatArea] Screen share: No peer connection for", currentPartnerId);
      screenShareRetryRef.current.delete(currentPartnerId);
      clearScreenShareAction();
      return;
    }

    if (screenSharePendingAction === "start") {
      if (screenShareStartInFlightRef.current) {
        clearScreenShareAction();
        return;
      }
      screenShareStartInFlightRef.current = true;
      startScreenShare(pc, () =>
        requestRenegotiation(currentPartnerId, "screen-share-start"),
      )
        .then((started) => {
          if (!started) return;
          screenShareRetryRef.current.delete(currentPartnerId);
          sendScreenShareState(currentPartnerId, true);
        })
        .catch((err) => {
          console.error("[ChatArea] Screen share start failed:", err);
        })
        .finally(() => {
          screenShareStartInFlightRef.current = false;
          clearScreenShareAction();
        });
    }
  }, [
    screenSharePendingAction,
    getPeerConnection,
    startScreenShare,
    stopScreenShare,
    requestRenegotiation,
    sendScreenShareState,
    clearLocalSharing,
    clearScreenShareAction,
    forceStopScreenCapture,
  ]);

  // ── Screen Share: Sync local hook state → store ───────────────────
  useEffect(() => {
    if (isLocalScreenSharing && localScreenStream) {
      setLocalSharing(localScreenStream);
    } else if (!isLocalScreenSharing) {
      clearLocalSharing();
    }
  }, [
    isLocalScreenSharing,
    localScreenStream,
    setLocalSharing,
    clearLocalSharing,
  ]);

  // ── Screen Share: Handle browser "Stop sharing" button ────────────
  // When the user clicks the native browser "Stop sharing" chrome,
  // useScreenShare fires onStopped. We need to:
  //   1. Notify the remote peer (ScreenShare=false)
  //   2. Clear the store so the sidebar button stops glowing
  useEffect(() => {
    onScreenShareStopped(() => {
      console.log(
        '[ChatArea] Browser "Stop sharing" detected — notifying remote peer',
      );
      const currentPartnerId = useSessionStore.getState().partnerId;
      if (currentPartnerId) {
        sendScreenShareState(currentPartnerId, false);
      }
      clearLocalSharing();
    });
    return () => {
      onScreenShareStopped(null);
    };
  }, [onScreenShareStopped, sendScreenShareState, clearLocalSharing]);

  // ── Voice Chat: Handle pending actions from Sidebar mic button ────
  useEffect(() => {
    if (!voicePendingAction) return;

    if (voicePendingAction === "stop") {
      forceStopMic();
      setMicOff();
      clearVoiceAction();

      const currentPartnerId = useSessionStore.getState().partnerId;
      if (currentPartnerId) {
        const pc = getPeerConnection(currentPartnerId);
        if (pc) {
          stopMic(pc);
        }
        sendVoiceChatState(currentPartnerId, false);
      }
      return;
    }

    const currentPartnerId = useSessionStore.getState().partnerId;
    if (!currentPartnerId) {
      clearVoiceAction();
      return;
    }

    const pc = getPeerConnection(currentPartnerId);
    if (!pc) {
      console.warn(
        "[ChatArea] VoiceChat: No peer connection for",
        currentPartnerId,
      );
      clearVoiceAction();
      return;
    }

    if (voicePendingAction === "start") {
      startMic(pc, () =>
        requestRenegotiation(currentPartnerId, "voice-chat-start"),
      )
        .then(() => {
          sendVoiceChatState(currentPartnerId, true);
        })
        .catch((err) => {
          console.error("[ChatArea] VoiceChat start failed:", err);
        })
        .finally(() => clearVoiceAction());
    }
  }, [
    voicePendingAction,
    getPeerConnection,
    startMic,
    stopMic,
    requestRenegotiation,
    sendVoiceChatState,
    clearVoiceAction,
    forceStopMic,
    setMicOff,
  ]);

  // ── Voice Chat: Play remote audio ─────────────────────────────────
  // Note: We use remoteStream (the same stream that holds remote camera/mic audio).
  // The useWebRTC.ontrack handler routes camera/mic audio to context.setRemoteStream.
  useEffect(() => {
    if (!remoteAudioRef.current) return;

    if (remoteStream && remoteStream.getAudioTracks().length > 0) {
      console.log(
        "[ChatArea] Voice Playback effect: isPartnerMicOn:",
        isPartnerMicOn,
        "stream:",
        remoteStream.id,
        "audioTracks:",
        remoteStream.getAudioTracks().length,
      );
      remoteStream.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
      if (remoteAudioRef.current.srcObject !== remoteStream) {
        console.log("[ChatArea] Binding remote stream to audio element");
        remoteAudioRef.current.srcObject = remoteStream;
      }
      remoteAudioRef.current.muted = false;
      remoteAudioRef.current.volume = 1;
      remoteAudioRef.current
        .play()
        .catch((e) => console.warn("[ChatArea] Audio autoplay blocked:", e));

      const needsNewGraph = audioStreamIdRef.current !== remoteStream.id;
      if (needsNewGraph) {
        cleanupAudioGraph();

        const context = new (
          window.AudioContext || (window as any).webkitAudioContext
        )();
        const source = context.createMediaStreamSource(remoteStream);
        const highPass = context.createBiquadFilter();
        highPass.type = "highpass";
        highPass.frequency.value = 85;
        highPass.Q.value = 0.7;
        const lowPass = context.createBiquadFilter();
        lowPass.type = "lowpass";
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

        if (context.state === "suspended") {
          const resume = () => {
            context.resume().catch(() => { });
            document.removeEventListener("click", resume);
            document.removeEventListener("touchstart", resume);
          };
          document.addEventListener("click", resume, { once: true });
          document.addEventListener("touchstart", resume, { once: true });
        }
      }
    } else if (remoteAudioRef.current.srcObject !== null) {
      console.log("[ChatArea] Unbinding remote stream (no audio tracks)");
      remoteAudioRef.current.srcObject = null;
      cleanupAudioGraph();
    }
  }, [isPartnerMicOn, remoteStream, cleanupAudioGraph]);

  const {
    partnerId,
    displayName,
    peerId,
    isInChat,
    partnerName,
    partnerAvatarSeed,
    partnerAvatarUrl,
    isVerified,
    partnerIsVerified,
    friendRequestsSent,
    friendRequestsReceived,
    friendList,
    friendRequestsEnabled,
    badgeVisibility,
    interests,
    interestsVisibility,
    joinedAt,
    sendFriendRequest: sendFriendRequestAction,
    acceptFriendRequest,
    declineFriendRequest,
    handleReceivedFriendRequest,
    avatarSeed,
    avatarUrl,
    leaveRoom,
    joinRoom,
    setPartnerAvatarUrl,
    setPartnerProfile,
    updatePeerProfile,
    currentRoomId: storeRoomId,
    addMatchToHistory,
    setChatMode,
  } = useSessionStore();

  // Effect to ensure correct matching queue
  useEffect(() => {
    setChatMode("text");
  }, [setChatMode]);

  useEffect(() => {
    const updateViewportHeight = () => {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty(
        "--viewport-height",
        `${height}px`,
      );
      const fullHeight = window.innerHeight || height;
      setIsKeyboardVisible(isMobile && fullHeight - height > 120);
    };
    updateViewportHeight();
    window.visualViewport?.addEventListener("resize", updateViewportHeight);
    window.visualViewport?.addEventListener("scroll", updateViewportHeight);
    window.addEventListener("resize", updateViewportHeight);
    return () => {
      window.visualViewport?.removeEventListener("resize", updateViewportHeight);
      window.visualViewport?.removeEventListener("scroll", updateViewportHeight);
      window.removeEventListener("resize", updateViewportHeight);
    };
  }, [isMobile]);


  useEffect(() => {
    partnerSkipHandledRef.current = false;
    pendingKeysRequestRef.current.clear();
    pendingKeysResponseRef.current.clear();
    pendingHandshakeRef.current.clear();
    if (partnerId) {
      partnerSkipIntentRef.current.delete(partnerId);
    }
  }, [partnerId]);

  const previousPartnerRef = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousPartnerRef.current;
    if (previous && previous !== partnerId) {
      clearSignalSession(previous);
    }
    previousPartnerRef.current = partnerId ?? null;
  }, [partnerId, clearSignalSession]);

  const { updateActivity: updatePeerActivity } = usePeerStatus(partnerId || undefined);
  const encryptionCountersRef = useRef({
    queued: 0,
    recoveryStarted: 0,
    recoverySucceeded: 0,
    decryptFail: 0,
    decryptTimeout: 0,
    flushed: 0,
  });
  const emitEncryptionMetric = useCallback(
    (event: string, peer?: string, extra?: Record<string, unknown>) => {
      devLog(
        JSON.stringify({
          level: "info",
          event,
          ts: Date.now(),
          peerId: peer,
          ...extra,
        }),
      );
    },
    [devLog],
  );

  const clearKeyExchangeGate = useCallback((peer: string | null | undefined) => {
    if (!peer) return;
    keyExchangeModeRef.current.delete(peer);
    responderFallbackEligibleAtRef.current.delete(peer);
    const keysToDelete: string[] = [];
    processedKeyPayloadFpRef.current.forEach((_, key) => {
      if (key.startsWith(`${peer}:`)) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach((key) => processedKeyPayloadFpRef.current.delete(key));
  }, []);

  const beginKeyExchangeCycle = useCallback(
    (peer: string, mode: "normal" | "reconnect") => {
      const nextEpoch = (keyExchangeEpochRef.current.get(peer) ?? 0) + 1;
      keyExchangeEpochRef.current.set(peer, nextEpoch);
      keyExchangeModeRef.current.set(peer, mode);
      if (mode === "reconnect") {
        responderFallbackEligibleAtRef.current.set(
          peer,
          Date.now() + KEY_EXCHANGE_RESPONDER_FALLBACK_GATE_MS,
        );
      } else {
        responderFallbackEligibleAtRef.current.delete(peer);
      }
      const keysToDelete: string[] = [];
      processedKeyPayloadFpRef.current.forEach((_, key) => {
        if (key.startsWith(`${peer}:`)) {
          keysToDelete.push(key);
        }
      });
      keysToDelete.forEach((key) => processedKeyPayloadFpRef.current.delete(key));
    },
    [],
  );

  const isDuplicateKeyPayload = useCallback(
    (peer: string, kind: "keys_response" | "handshake", payload: string) => {
      const fp = fingerprintValue(payload);
      if (!fp) return false;
      const epoch = keyExchangeEpochRef.current.get(peer) ?? 0;
      const key = `${peer}:${epoch}:${kind}`;
      const previousFp = processedKeyPayloadFpRef.current.get(key);
      if (previousFp === fp) {
        return true;
      }
      processedKeyPayloadFpRef.current.set(key, fp);
      return false;
    },
    [],
  );

  useEffect(() => {
    if (
      shouldMarkSignalReady({
        partnerId,
        isCryptoReady,
        hasSignalSession: !!(partnerId && hasSignalSession(partnerId)),
      })
    ) {
      if (!isSignalReady) {
        setIsSignalReady(true);
        encryptionCountersRef.current.recoverySucceeded += 1;
        emitEncryptionMetric("encryption_recovery_succeeded", partnerId, {
          total: encryptionCountersRef.current.recoverySucceeded,
        });
      }
      isReconnectingRef.current = false;
      clearKeyExchangeGate(partnerId);
    }
  }, [
    clearKeyExchangeGate,
    emitEncryptionMetric,
    partnerId,
    isCryptoReady,
    isSignalReady,
    hasSignalSession,
    signalSessionVersion,
  ]);

  useEffect(() => {
    if (!partnerId || !isCryptoReady) return;
    const myPeerId = useSessionStore.getState().peerId;

    if (pendingKeysRequestRef.current.has(partnerId)) {
      pendingKeysRequestRef.current.delete(partnerId);
      try {
        const nowTs = Date.now();
        const lastResponseAt =
          lastKeysRequestResponseAtRef.current.get(partnerId) ?? 0;
        if (!(nowTs - lastResponseAt < 600)) {
          lastKeysRequestResponseAtRef.current.set(partnerId, nowTs);
          const bundle = generatePreKeyBundle();
          sendKeysResponse(partnerId, bundle as any);
        }
      } catch (err) {
        console.error(
          "[ChatArea] [Signal Debug] Failed to process pending KeysRequest:",
          err,
        );
      }
    }

    const pendingKeysResponse = pendingKeysResponseRef.current.get(partnerId);
    if (pendingKeysResponse && myPeerId < partnerId) {
      pendingKeysResponseRef.current.delete(partnerId);
      try {
        if (!isDuplicateKeyPayload(partnerId, "keys_response", pendingKeysResponse)) {
          const initiation = initiateSignalSession(partnerId, pendingKeysResponse);
          sendHandshake(partnerId, initiation as any);
          isReconnectingRef.current = false;
          setIsSignalReady(true);
          clearKeyExchangeGate(partnerId);
        }
      } catch (err) {
        console.error(
          "[ChatArea] [Signal Debug] Failed to process pending KeysResponse:",
          err,
        );
      }
    }

    const pendingHandshake = pendingHandshakeRef.current.get(partnerId);
    if (pendingHandshake && myPeerId > partnerId) {
      pendingHandshakeRef.current.delete(partnerId);
      try {
        if (!isDuplicateKeyPayload(partnerId, "handshake", pendingHandshake)) {
          respondToSignalSession(partnerId, pendingHandshake);
          isReconnectingRef.current = false;
          setIsSignalReady(true);
          clearKeyExchangeGate(partnerId);
        }
      } catch (err) {
        console.error(
          "[ChatArea] [Signal Debug] Failed to process pending SignalHandshake:",
          err,
        );
      }
    }
  }, [
    partnerId,
    isCryptoReady,
    generatePreKeyBundle,
    sendKeysResponse,
    initiateSignalSession,
    sendHandshake,
    respondToSignalSession,
    isDuplicateKeyPayload,
    clearKeyExchangeGate,
  ]);

  const addIncomingChatMessage = useCallback(
    (message: IncomingChatMessage, from: string, content: string) => {
      if (!isMountedRef.current) return;
      const rid = activeRoomIdRef.current;
      if (!rid) return;
      const exists = useMessageStore
        .getState()
        .getMessages(rid)
        .some((m) => m.id === message.id);
      if (exists) return;
      useMessageStore.getState().addMessage(rid, {
        id: message.id,
        username: message.username || funAnimalName(from),
        avatarSeed: message.avatarSeed || from,
        avatarUrl: message.avatarUrl || null,
        timestamp: message.timestamp || now(),
        content,
        isVerified: message.isVerified ?? partnerIsVerified,
        senderId: from,
        replyToMessage: message.replyToMessage
          ? (() => {
            let replyContent: string = message.replyToMessage.content;
            if (replyContent === "[encrypted]" || replyContent === "") {
              const existing = useMessageStore
                .getState()
                .getMessages(rid)
                .find((m) => m.id === message.replyToMessage!.id);
              replyContent = existing ? existing.content : "↩ Quoted message";
            }
            return {
              id: message.replyToMessage.id,
              username: funAnimalName(from),
              avatarSeed: from,
              avatarUrl: message.avatarUrl || null,
              timestamp: message.timestamp,
              content: replyContent,
            };
          })()
          : null,
      });
      recentlyHandledEncryptedRef.current.set(`${from}:${message.id}`, Date.now());
      if (recentlyHandledEncryptedRef.current.size > 500) {
        const cutoff = Date.now() - ENCRYPTED_MESSAGE_DEDUPE_TTL_MS;
        recentlyHandledEncryptedRef.current.forEach((handledAt, key) => {
          if (handledAt < cutoff) {
            recentlyHandledEncryptedRef.current.delete(key);
          }
        });
      }
      if (from === partnerId && message.avatarUrl) {
        setPartnerAvatarUrl(message.avatarUrl);
      }
    },
    [partnerId, partnerIsVerified, setPartnerAvatarUrl],
  );

  const decryptIncomingContent = useCallback(
    (message: IncomingChatMessage, from: string) => {
      const hasEncryptedContent = !!message.encryptedContent;
      const isEncryptedFlag = !!message.isEncrypted;
      if (hasEncryptedContent) {
        const bytes = toEncryptedBytes(message.encryptedContent);
        const decrypted = decryptMessage(from, bytes);
        return new TextDecoder().decode(decrypted);
      }
      if (isEncryptedFlag) {
        const payload = message.content;
        if (payload === "[encrypted]") {
          throw new Error("Encrypted payload missing ciphertext");
        }
        const binary = atob(payload);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const decrypted = decryptMessage(from, bytes);
        return new TextDecoder().decode(decrypted);
      }
      return message.content;
    },
    [decryptMessage],
  );

  const enqueuePendingEncryptedMessage = useCallback(
    (message: IncomingChatMessage, from: string) => {
      const key = `${from}:${message.id}`;
      const existing = pendingEncryptedMessagesRef.current.get(key);
      pendingEncryptedMessagesRef.current.set(key, {
        message,
        from,
        receivedAt: existing?.receivedAt ?? Date.now(),
      });
    },
    [],
  );

  const recoverEncryptionSession = useCallback(
    (from: string) => {
      if (!from || !isCryptoReady || !signalingConnected) return;
      const nowTs = Date.now();
      const lastTs = lastEncryptionRecoveryAtRef.current.get(from) ?? 0;
      if (nowTs - lastTs < 1500) return;
      lastEncryptionRecoveryAtRef.current.set(from, nowTs);
      try {
        encryptionCountersRef.current.recoveryStarted += 1;
        emitEncryptionMetric("encryption_recovery_started", from, {
          total: encryptionCountersRef.current.recoveryStarted,
        });
        setIsSignalReady(false);
        keyExchangeInitiatedRef.current = null;
        beginKeyExchangeCycle(from, "reconnect");
        clearSignalSession(from);
        const bundle = generatePreKeyBundle();
        publishKeys(bundle as any);
        requestKeys(from);
        isReconnectingRef.current = true;
      } catch (err) {
        console.error("[ChatArea] Encryption recovery failed:", err);
      }
    },
    [
      isCryptoReady,
      signalingConnected,
      clearSignalSession,
      beginKeyExchangeCycle,
      emitEncryptionMetric,
      generatePreKeyBundle,
      publishKeys,
      requestKeys,
    ],
  );

  const flushPendingEncryptedMessages = useCallback(() => {
    let remaining = 0;
    const nowTs = Date.now();
    pendingEncryptedMessagesRef.current.forEach((entry, key) => {
      const canDecrypt = isCryptoReady && hasSignalSession(entry.from);
      if (!canDecrypt) {
        if (nowTs - entry.receivedAt > 12000) {
          encryptionCountersRef.current.decryptTimeout += 1;
          emitEncryptionMetric("encryption_decrypt_timeout", entry.from, {
            total: encryptionCountersRef.current.decryptTimeout,
          });
          addIncomingChatMessage(
            entry.message,
            entry.from,
            "⚠ Message could not be decrypted",
          );
          pendingEncryptedMessagesRef.current.delete(key);
        } else {
          remaining += 1;
        }
        return;
      }
      try {
        if (decryptInFlightRef.current.has(key)) {
          remaining += 1;
          return;
        }
        decryptInFlightRef.current.add(key);
        const decrypted = decryptIncomingContent(entry.message, entry.from);
        encryptionCountersRef.current.flushed += 1;
        emitEncryptionMetric("encryption_queue_flushed", entry.from, {
          total: encryptionCountersRef.current.flushed,
        });
        addIncomingChatMessage(entry.message, entry.from, decrypted);
        pendingEncryptedMessagesRef.current.delete(key);
      } catch (err) {
        if (nowTs - entry.receivedAt > 12000) {
          console.error("[ChatArea] Decryption failed after retries:", err);
          encryptionCountersRef.current.decryptTimeout += 1;
          emitEncryptionMetric("encryption_decrypt_timeout", entry.from, {
            total: encryptionCountersRef.current.decryptTimeout,
          });
          addIncomingChatMessage(
            entry.message,
            entry.from,
            "⚠ Message could not be decrypted",
          );
          pendingEncryptedMessagesRef.current.delete(key);
        } else {
          recoverEncryptionSession(entry.from);
          remaining += 1;
        }
      } finally {
        decryptInFlightRef.current.delete(key);
      }
    });
    if (remaining > 0 && !pendingDecryptFlushTimerRef.current) {
      pendingDecryptFlushTimerRef.current = setTimeout(() => {
        pendingDecryptFlushTimerRef.current = null;
        flushPendingEncryptedMessages();
      }, 250);
    }
  }, [
    addIncomingChatMessage,
    decryptIncomingContent,
    emitEncryptionMetric,
    hasSignalSession,
    isCryptoReady,
    recoverEncryptionSession,
  ]);

  const schedulePendingEncryptedFlush = useCallback(
    (delayMs = 120) => {
      if (pendingDecryptFlushTimerRef.current) return;
      pendingDecryptFlushTimerRef.current = setTimeout(() => {
        pendingDecryptFlushTimerRef.current = null;
        flushPendingEncryptedMessages();
      }, delayMs);
    },
    [flushPendingEncryptedMessages],
  );

  const sendProfileToTargets = useCallback(() => {
    if (!sendProfileUpdate) return;
    const profile = {
      username: displayName || "Anonymous",
      avatarSeed,
      avatarUrl: avatarUrl || null,
      interests,
      interestsVisibility,
      badgeVisibility,
      joinedAt,
    };
    const directTargets = isDirectConnectMode
      ? Array.from(new Set(peersInRoom))
      : partnerId
        ? [partnerId]
        : [];
    const targets =
      directTargets.length > 0
        ? directTargets
        : isDirectConnectMode
          ? [""]
          : [];
    targets.forEach((targetPeerId) => {
      sendProfileUpdate(targetPeerId, profile);
    });
  }, [
    sendProfileUpdate,
    displayName,
    avatarSeed,
    avatarUrl,
    interests,
    interestsVisibility,
    isDirectConnectMode,
    peersInRoom,
    partnerId,
    badgeVisibility,
    joinedAt,
  ]);

  const CHAT_CACHE_PREFIX = "buzzu_chat_cache_";
  const MAX_CACHED_MESSAGES = 200;
  const imageCacheRef = useRef<Map<string, string>>(new Map());
  const setCachedImageDataUrl = useCallback((blobUrl: string, dataUrl: string) => {
    const cache = imageCacheRef.current;
    if (cache.has(blobUrl)) {
      cache.delete(blobUrl);
    }
    cache.set(blobUrl, dataUrl);
    if (cache.size > MAX_CACHED_IMAGE_DATA_URLS) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (oldestKey) {
        cache.delete(oldestKey);
      }
    }
  }, []);
  const blobToDataUrl = useCallback(
    (blob: Blob) =>
      new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(typeof reader.result === "string" ? reader.result : "");
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      }),
    [],
  );

  // Messages live in a global Zustand store keyed by roomId — survives route
  // changes (DM ↔ matched chat). Same pattern as Rocket.Chat / Element.
  const activeRoomId = urlRoomId || storeRoomId || "";
  const activeRoomIdRef = useRef(activeRoomId);
  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    imageCacheRef.current.clear();
  }, [activeRoomId]);

  useAutoCleanup({
    enabled: isLocalScreenSharing || isRemoteSharing,
    activeRoomId: activeRoomId || null,
    getPeerConnections,
    getConnectionState,
    closePeerConnection,
  });
  const messages = useMessageStore(
    (s) => s.messages[activeRoomId] ?? EMPTY_MESSAGES,
  );

  useEffect(() => {
    if (!activeRoomId) return;
    if (messages.length === 0) {
      const cachedRaw = safeSessionStorage.getItem(
        `${CHAT_CACHE_PREFIX}${activeRoomId}`,
      );
      if (!cachedRaw) return;
      try {
        const parsed = JSON.parse(cachedRaw) as {
          partnerId: string | null;
          messages: Message[];
        };
        if (parsed.partnerId && parsed.partnerId !== partnerId) return;
        if (Array.isArray(parsed.messages) && parsed.messages.length > 0) {
          useMessageStore
            .getState()
            .setMessages(activeRoomId, parsed.messages);
        }
      } catch {
        return;
      }
    }
  }, [activeRoomId, messages.length, partnerId]);

  useEffect(() => {
    if (!activeRoomId) return;
    if (persistMessagesTimerRef.current) {
      clearTimeout(persistMessagesTimerRef.current);
      persistMessagesTimerRef.current = null;
    }
    if (messages.length === 0) return;
    let cancelled = false;
    const persistMessages = async () => {
      const baseMessages = messages
        .filter((m) => !m.isVanish)
        .filter((m) => m.status !== "sending")
        .slice(-MAX_CACHED_MESSAGES);
      const cacheableMessages = baseMessages.map((message) => {
        const { progress, ...rest } = message;
        return rest;
      });
      const processed = await Promise.all(
        cacheableMessages.map(async (message) => {
          if (!message.content.includes("blob:")) return message;
          const match = message.content.match(/\((blob:[^)]+)\)/);
          const blobUrl = match?.[1];
          if (!blobUrl) return message;
          const cached = imageCacheRef.current.get(blobUrl);
          if (cached) {
            return { ...message, content: message.content.replace(blobUrl, cached) };
          }
          try {
            const response = await fetch(blobUrl);
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            if (dataUrl) {
              setCachedImageDataUrl(blobUrl, dataUrl);
              return { ...message, content: message.content.replace(blobUrl, dataUrl) };
            }
          } catch {
            return message;
          }
          return message;
        }),
      );
      if (cancelled) return;
      safeSessionStorage.setItem(
        `${CHAT_CACHE_PREFIX}${activeRoomId}`,
        JSON.stringify({
          partnerId: partnerId || null,
          messages: processed,
        }),
      );
    };
    persistMessagesTimerRef.current = setTimeout(() => {
      void persistMessages();
      persistMessagesTimerRef.current = null;
    }, MESSAGE_CACHE_PERSIST_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      if (persistMessagesTimerRef.current) {
        clearTimeout(persistMessagesTimerRef.current);
        persistMessagesTimerRef.current = null;
      }
    };
  }, [
    activeRoomId,
    messages,
    partnerId,
    blobToDataUrl,
    setCachedImageDataUrl,
  ]);

  const fileTransferOptions = React.useMemo(
    () => ({
      onProgress: import.meta.env.DEV
        ? (p: number) =>
          console.log(`[ChatArea] Transfer progress: ${p.toFixed(1)}%`)
        : () => { },
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
            senderId: partnerId,
            isVanish: isVanish,
          };
          const rid = activeRoomId;
          if (rid) useMessageStore.getState().addMessage(rid, newMessage);
        }
      },
    }),
    [
      partnerId,
      partnerName,
      partnerAvatarSeed,
      partnerIsVerified,
      activeRoomId,
    ],
  );

  const {
    sendFile,
    receiveChunk,
    resetTransfer,
    isTransferring,
    progress: transferProgress,
  } = useFileTransfer(fileTransferOptions);

  const startSearching = useCallback(() => {
    if (typeof sessionStorage !== "undefined") {
      safeSessionStorage.removeItem(SUPPRESS_AUTO_START_ONCE_KEY);
      safeSessionStorage.removeItem(SKIP_VIEW_STATE_KEY);
    }
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
    setConnectionState("searching");
    if (roomToClear) {
      useMessageStore.getState().clearRoom(roomToClear);
      safeSessionStorage.removeItem(`${CHAT_CACHE_PREFIX}${roomToClear}`);
    }
    setReplyingTo(null);
    setEditingMessage(null);
    setEditingMessageId(null);
    setIsSignalReady(false);
    clearSignalSessions();
    setIsVanishMode(false);
    setIsPartnerTyping(false);
    // Preserve local screen capture across matches — only clear remote state
    detachScreenShare();
    resetRemoteScreenShare();
    handledMatchId.current = null;
    p2pInitRoomRef.current = null;
    hasReconnected.current = false;
    isReconnectingRef.current = false;
    navigate("/chat/new", { replace: true });
    cleanupBlobUrls();
    cleanupAudioGraph();
    startMatching(true);
  }, [
    startMatching,
    disconnectSignaling,
    closeAllPeerConnections,
    leaveRoom,
    setMatchData,
    navigate,
    clearSignalSessions,
    detachScreenShare,
    resetRemoteScreenShare,
    cleanupBlobUrls,
    cleanupAudioGraph,
  ]);

  const handleStart = () => {
    console.log("[ChatArea] Manual START clicked");
    if (typeof sessionStorage !== "undefined") {
      safeSessionStorage.removeItem(SUPPRESS_AUTO_START_ONCE_KEY);
      safeSessionStorage.removeItem(SKIP_VIEW_STATE_KEY);
    }
    startSearching();
  };
  const handleStop = () => {
    console.log("[ChatArea] Manual STOP clicked");
    if (typeof sessionStorage !== "undefined") {
      safeSessionStorage.removeItem(SUPPRESS_AUTO_START_ONCE_KEY);
      safeSessionStorage.removeItem(SKIP_VIEW_STATE_KEY);
    }
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
    setConnectionState("idle");
    setPartner(null);
    setIsSignalReady(false);
    clearSignalSessions();
    setIsVanishMode(false);
    setIsPartnerTyping(false);
    // Full stop: kill the screen capture and mic entirely
    forceStopScreenCapture();
    resetScreenShareStore();
    forceStopMic();
    resetVoiceChatStore();
    handledMatchId.current = null;
    p2pInitRoomRef.current = null;
    isReconnectingRef.current = false;
    cleanupBlobUrls();
    cleanupAudioGraph();
    navigate("/chat/new", { replace: true });
    if (roomToClear) {
      useMessageStore.getState().clearRoom(roomToClear);
      safeSessionStorage.removeItem(`${CHAT_CACHE_PREFIX}${roomToClear}`);
    }
  };
  const finalizePartnerSkip = useCallback(() => {
    if (partnerSkipHandledRef.current) return;
    partnerSkipHandledRef.current = true;
    if (partnerLeaveTimerRef.current) {
      clearTimeout(partnerLeaveTimerRef.current);
      partnerLeaveTimerRef.current = null;
    }
    pendingLeavePeerRef.current = null;
    setConnectionState("partner_skipped");
    disconnectSignaling();
    closeAllPeerConnections();
    resetTransfer();
    fileTransferChannelRef.current = null;
    setIsSignalReady(false);
    clearSignalSessions();
    if (p2pInitTimerRef.current) {
      clearTimeout(p2pInitTimerRef.current);
      p2pInitTimerRef.current = null;
    }
    stopMatching(true);
    cleanupBlobUrls();
    cleanupAudioGraph();
    leaveRoom();
    setMatchData(null);
    handledMatchId.current = null;
    keyExchangeInitiatedRef.current = null;
    hasReconnected.current = false;
    isReconnectingRef.current = false;
    detachScreenShare();
    resetRemoteScreenShare();
    if (typeof sessionStorage !== "undefined") {
      safeSessionStorage.setItem(SUPPRESS_AUTO_START_ONCE_KEY, "1");
      safeSessionStorage.setItem(SKIP_VIEW_STATE_KEY, "partner");
    }
    navigate("/chat/new", { replace: true });
  }, [
    disconnectSignaling,
    closeAllPeerConnections,
    resetTransfer,
    stopMatching,
    leaveRoom,
    setMatchData,
    clearSignalSessions,
    detachScreenShare,
    resetRemoteScreenShare,
    cleanupBlobUrls,
    cleanupAudioGraph,
    navigate,
  ]);

  const handleSkip = () => {
    if (signalingTimeoutRef.current) {
      clearTimeout(signalingTimeoutRef.current);
      signalingTimeoutRef.current = null;
    }
    if (p2pInitTimerRef.current) {
      clearTimeout(p2pInitTimerRef.current);
      p2pInitTimerRef.current = null;
    }
    const skipSignalChannels = new Set<RTCDataChannel>();
    const addSkipChannel = (channel?: RTCDataChannel | null) => {
      if (!channel) return;
      if (channel.label !== "file-transfer") return;
      if (channel.readyState !== "open") return;
      skipSignalChannels.add(channel);
    };
    if (isDirectConnectMode) {
      getPeerConnections().forEach((pc) => {
        const channelMap = (pc as any).dataChannels as
          | Map<string, RTCDataChannel>
          | undefined;
        channelMap?.forEach((channel) => {
          addSkipChannel(channel);
        });
      });
    } else if (partnerId) {
      const partnerPc = getPeerConnection(partnerId);
      const channelMap = (partnerPc as any)?.dataChannels as
        | Map<string, RTCDataChannel>
        | undefined;
      addSkipChannel(channelMap?.get(partnerId));
      channelMap?.forEach((channel) => {
        addSkipChannel(channel);
      });
    }
    addSkipChannel(fileTransferChannelRef.current);
    const shouldDelayDisconnect = Boolean(
      (partnerId && signalingConnected) || skipSignalChannels.size > 0,
    );
    if (partnerId && signalingConnected) {
      sendSkip(partnerId, "skip");
    }
    const skipPayload = JSON.stringify({
      type: "skip_signal",
      at: Date.now(),
    });
    skipSignalChannels.forEach((channel) => {
      try {
        channel.send(skipPayload);
      } catch (err) {
        devWarn("[ChatArea] Failed to send skip signal over data channel", err);
      }
    });
    const finalizeSelfSkip = () => {
      stopMatching(true);
      disconnectSignaling({ intent: "skip" });
      closeAllPeerConnections();
      const roomToClear = useSessionStore.getState().currentRoomId;
      leaveRoom();
      setMatchData(null);
      resetTransfer();
      fileTransferChannelRef.current = null;
      setPartner(null);
      setConnectionState("self_skipped");
      setIsSignalReady(false);
      clearSignalSessions();
      setIsVanishMode(false);
      setIsPartnerTyping(false);
      detachScreenShare();
      detachVoiceChat();
      useVoiceChatStore.getState().setPartnerMicOn(false);
      cleanupBlobUrls();
      cleanupAudioGraph();
      handledMatchId.current = null;
      p2pInitRoomRef.current = null;
      hasReconnected.current = false;
      isReconnectingRef.current = false;
      if (roomToClear) useMessageStore.getState().clearRoom(roomToClear);
      if (typeof sessionStorage !== "undefined") {
        safeSessionStorage.setItem(SUPPRESS_AUTO_START_ONCE_KEY, "1");
        safeSessionStorage.setItem(SKIP_VIEW_STATE_KEY, "self");
      }
      navigate("/chat/new", { replace: true });
      selfSkipFinalizeTimerRef.current = null;
    };

    if (selfSkipFinalizeTimerRef.current) {
      clearTimeout(selfSkipFinalizeTimerRef.current);
      selfSkipFinalizeTimerRef.current = null;
    }

    if (shouldDelayDisconnect) {
      setConnectionState("self_skipped");
      selfSkipFinalizeTimerRef.current = setTimeout(finalizeSelfSkip, 950);
      return;
    }

    finalizeSelfSkip();
  };

  const handleReply = (message: Message) => {
    setReplyingTo(message);
    setEditingMessage(null);
    setEditingMessageId(null);
  };

  const handleProfileClick = (
    username: string,
    avatarSeed: string,
    avatarUrl?: string | null,
    isVerified?: boolean,
    clickedPeerId?: string,
  ) => {
    const currentAvatarUrl =
      username === partnerName ? partnerAvatarUrl : avatarUrl || null;
    const resolvedPeerId = clickedPeerId || partnerId || "";
    const meta = resolvedPeerId ? peerProfileMeta[resolvedPeerId] : undefined;
    setSelectedProfile({
      peerId: resolvedPeerId,
      username,
      avatarSeed,
      avatarUrl: currentAvatarUrl,
      isVerified,
      interests: meta?.interests,
      interestsVisibility: meta?.interestsVisibility,
      badgeVisibility: meta?.badgeVisibility,
      joinedAt: meta?.joinedAt,
    });
    setIsProfileModalOpen(true);
  };

  const handleEdit = (message: Message) => {
    if (!peerId || message.senderId !== peerId) return;
    setEditingMessageId(message.id);
    setEditingMessage(null);
    setReplyingTo(null);
  };

  const handleSaveEdit = useCallback(
    async (id: string, newContent: string) => {
      // 1. Update local store immediately for instant feedback
      const rid = activeRoomId;
      if (rid)
        useMessageStore
          .getState()
          .updateMessage(rid, id, (msg) => ({ ...msg, content: newContent, isEdited: true }));
      setEditingMessageId(null);

      // 2. Sync edit to the remote peer via data channel (P2P)
      if (fileTransferChannelRef.current && fileTransferChannelRef.current.readyState === 'open') {
        console.log("[ChatArea] Sending edit_message via data channel:", id);
        fileTransferChannelRef.current.send(JSON.stringify({
          type: 'edit_message',
          messageId: id,
          content: newContent
        }));
      } else {
        console.log("[ChatArea] Cannot send edit_message - data channel not open");
      }
    },
    [activeRoomId],
  );

  const handleCancelEdit = () => setEditingMessageId(null);

  const handleReport = (message: Message) => {
    setMessageToReport(message);
    setIsReportModalOpen(true);
  };

  const handleDelete = (message: Message) => {
    if (!peerId || message.senderId !== peerId) return;
    console.log("[ChatArea] handleDelete called - messageId:", message.id, "partnerId:", partnerId, "activeRoomId:", activeRoomId);
    const rid = activeRoomId;
    if (rid) useMessageStore.getState().removeMessage(rid, message.id);

    // Remote peer sync via data channel (P2P)
    if (fileTransferChannelRef.current && fileTransferChannelRef.current.readyState === 'open') {
      console.log("[ChatArea] Sending delete_message via data channel:", message.id);
      fileTransferChannelRef.current.send(JSON.stringify({
        type: 'delete_message',
        messageId: message.id
      }));
    } else {
      console.log("[ChatArea] Cannot send delete_message - data channel not open");
    }
  };

  const resolveOpenChatChannels = useCallback(
    (targetPeerId?: string | null) => {
      const openChannels = new Set<RTCDataChannel>();
      const addChannel = (channel?: RTCDataChannel | null) => {
        if (!channel) return;
        if (channel.label !== "file-transfer") return;
        if (channel.readyState !== "open") return;
        openChannels.add(channel);
      };

      if (isDirectConnectMode) {
        getPeerConnections().forEach((pc) => {
          const channelMap = (pc as any).dataChannels as
            | Map<string, RTCDataChannel>
            | undefined;
          channelMap?.forEach((channel) => {
            addChannel(channel);
          });
        });
      } else {
        if (targetPeerId) {
          getOpenDataChannels(targetPeerId).forEach((channel) => {
            addChannel(channel);
          });
          const partnerPc = getPeerConnection(targetPeerId);
          const channelMap = (partnerPc as any)?.dataChannels as
            | Map<string, RTCDataChannel>
            | undefined;
          addChannel(channelMap?.get(targetPeerId));
          channelMap?.forEach((channel) => {
            addChannel(channel);
          });
        }
        addChannel(fileTransferChannelRef.current);
      }

      return Array.from(openChannels);
    },
    [isDirectConnectMode, getPeerConnections, getPeerConnection, getOpenDataChannels],
  );

  const markP2PHealthy = useCallback(
    (targetPeerId: string, rttMs: number) => {
      p2pHealthyPeersRef.current.set(targetPeerId, { lastAckAt: Date.now(), rttMs });
      traceE2E("chat.p2p.health.confirmed", {
        fromPeerId: peerId,
        toPeerId: targetPeerId,
        rttMs: Number(rttMs.toFixed(1)),
        status: "healthy",
      }, "info");
    },
    [peerId],
  );

  const sendP2PProbe = useCallback(
    (channel: RTCDataChannel, targetPeerId: string) => {
      if (channel.readyState !== "open") return;
      const probeId = `${targetPeerId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const sentAt = Date.now();
      const payload = JSON.stringify({
        type: "p2p_probe",
        probeId,
        sentAt,
      });
      try {
        channel.send(payload);
      } catch (err) {
        traceE2E("chat.p2p.probe.send_failed", {
          probeId,
          fromPeerId: peerId,
          toPeerId: targetPeerId,
          error: err instanceof Error ? err.message : String(err),
        }, "warn");
        return;
      }
      pendingP2PProbeRef.current.set(probeId, { peerId: targetPeerId, sentAt });
      const existingTimeout = p2pProbeTimeoutsRef.current.get(probeId);
      if (existingTimeout) clearTimeout(existingTimeout);
      const timeout = setTimeout(() => {
        p2pProbeTimeoutsRef.current.delete(probeId);
        pendingP2PProbeRef.current.delete(probeId);
        traceE2E("chat.p2p.probe.timeout", {
          probeId,
          fromPeerId: peerId,
          toPeerId: targetPeerId,
          timeoutMs: P2P_PROBE_TIMEOUT_MS,
        }, "warn");
      }, P2P_PROBE_TIMEOUT_MS);
      p2pProbeTimeoutsRef.current.set(probeId, timeout);
      traceE2E("chat.p2p.probe.sent", {
        probeId,
        fromPeerId: peerId,
        toPeerId: targetPeerId,
        channelLabel: channel.label,
      }, "debug");
    },
    [peerId],
  );

  const clearPendingSignalFallback = useCallback((messageId: string) => {
    const timer = pendingSignalFallbackTimersRef.current.get(messageId);
    if (timer) {
      clearTimeout(timer);
      pendingSignalFallbackTimersRef.current.delete(messageId);
    }
  }, []);

  const sendChatDeliveryAck = useCallback(
    (targetPeerId: string, messageId: string) => {
      if (!targetPeerId || !messageId) return;
      const ackPayload = JSON.stringify({
        type: "chat_ack",
        messageId,
      });
      const channels = resolveOpenChatChannels(targetPeerId);
      traceE2E("chat.ack.outbound", {
        transport: "p2p_data_channel",
        messageId,
        fromPeerId: peerId,
        toPeerId: targetPeerId,
        openChannelCount: channels.length,
      }, "debug");
      channels.forEach((channel) => {
        try {
          channel.send(ackPayload);
        } catch (_) { }
      });
    },
    [peerId, resolveOpenChatChannels],
  );

  const handleSendMessage = useCallback(
    async (content: string, replyToMessage?: Message | null) => {
      const messageId = makeId();
      let encryptedContent: string | undefined;
      let isEncrypted = false;
      const partnerHasSignalSession = !!(partnerId && hasSignalSession(partnerId));
      traceE2E("chat.message.create", {
        messageId,
        fromPeerId: peerId,
        toPeerId: partnerId ?? null,
        roomId: activeRoomId ?? null,
        plaintextLength: content.length,
        hasReply: !!replyToMessage,
        isSignalReady,
        isCryptoReady,
        hasSignalSession: partnerHasSignalSession,
      }, "info");

      if (partnerId && isCryptoReady && isSignalReady && partnerHasSignalSession) {
        try {
          traceE2E("chat.message.encrypt.start", {
            messageId,
            fromPeerId: peerId,
            toPeerId: partnerId,
            plaintextLength: content.length,
          }, "debug");
          const encrypted = await encryptMessage(partnerId, content);
          encryptedContent = JSON.stringify(Array.from(encrypted));
          isEncrypted = true;
          traceE2E("chat.message.encrypt.success", {
            messageId,
            fromPeerId: peerId,
            toPeerId: partnerId,
            plaintextLength: content.length,
            encryptedPayloadLength: encryptedContent.length,
            encryptedPayloadFp: fingerprintValue(encryptedContent),
            encryptionStatus: "signal_e2e",
          }, "info");
        } catch (e) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          const isMissingSessionError =
            errorMessage.includes("No Signal session");
          if (isMissingSessionError && partnerId) {
            traceE2E("chat.message.blocked_no_secure_session", {
              messageId,
              fromPeerId: peerId,
              toPeerId: partnerId,
              isSignalReady,
              isCryptoReady,
              hasSignalSession: hasSignalSession(partnerId),
              encryptionStatus: "not_ready",
              recoveredFromEncryptError: true,
            }, "warn");
            recoverEncryptionSession(partnerId);
            const rid = activeRoomId;
            if (rid)
              useMessageStore.getState().addMessage(rid, {
                id: makeId(),
                username: "System",
                avatarSeed: "",
                avatarUrl: null,
                timestamp: now(),
                content:
                  "⚠ Message not sent — secure session is not ready yet. Retrying key exchange.",
                isVerified: false,
                replyToMessage: null,
              });
            return;
          }
          console.error(
            "[ChatArea] Encryption failed — refusing to send plaintext:",
            e,
          );
          traceE2E("chat.message.encrypt.failed", {
            messageId,
            fromPeerId: peerId,
            toPeerId: partnerId,
            plaintextLength: content.length,
            encryptionStatus: "failed",
            error: errorMessage,
          }, "error");
          // SECURITY: Never silently downgrade to plaintext. Notify the user.
          const rid = activeRoomId;
          if (rid)
            useMessageStore.getState().addMessage(rid, {
              id: makeId(),
              username: "System",
              avatarSeed: "",
              avatarUrl: null,
              timestamp: now(),
              content:
                "⚠ Message could not be sent — encryption failed. Try reconnecting.",
              isVerified: false,
              replyToMessage: null,
            });
          return; // Abort — do NOT send plaintext
        }
      }
      if (partnerId && !isEncrypted) {
        traceE2E("chat.message.blocked_no_secure_session", {
          messageId,
          fromPeerId: peerId,
          toPeerId: partnerId,
          isSignalReady,
          isCryptoReady,
          hasSignalSession: hasSignalSession(partnerId),
          encryptionStatus: "not_ready",
        }, "warn");
        recoverEncryptionSession(partnerId);
        const rid = activeRoomId;
        if (rid)
          useMessageStore.getState().addMessage(rid, {
            id: makeId(),
            username: "System",
            avatarSeed: "",
            avatarUrl: null,
            timestamp: now(),
            content:
              "⚠ Message not sent — secure session is not ready yet. Retrying key exchange.",
            isVerified: false,
            replyToMessage: null,
          });
        return;
      }

      // Async closure validation check to prevent broadcasting after skip
      if (activeRoomIdRef.current !== activeRoomId) {
        console.warn("[ChatArea] Aborting sendMessage: room shifted during encryption.");
        return;
      }

      let openChannels = resolveOpenChatChannels(partnerId);
      if (openChannels.length === 0 && partnerId && !isDirectConnectMode) {
        try {
          const becameReady = await waitForDataChannelOpen(
            partnerId,
            MESSAGE_P2P_OPEN_WAIT_MS,
          );
          if (becameReady) {
            openChannels = resolveOpenChatChannels(partnerId);
          }
        } catch (_) {
          openChannels = resolveOpenChatChannels(partnerId);
        }
      }

      const rid = activeRoomId;
      const canUseSignalingFallback = !!(partnerId && signalingConnected);
      if (openChannels.length === 0 && !canUseSignalingFallback) {
        if (rid)
          useMessageStore.getState().addMessage(rid, {
            id: makeId(),
            username: "System",
            avatarSeed: "",
            avatarUrl: null,
            timestamp: now(),
            content: "⚠ Message could not be sent — P2P data channel is not ready.",
            isVerified: false,
            replyToMessage: null,
          });
        return;
      }

      const message = {
        id: messageId,
        username: "Me",
        avatarSeed: avatarSeed,
        avatarUrl: avatarUrl || null,
        timestamp: now(),
        content, // Local message stays plaintext
        isVerified:
          isVerified &&
          (badgeVisibility === "Everyone" ||
            (badgeVisibility === "Friends" &&
              !!partnerId &&
              friendList.some((friend) => friend.id === partnerId))),
        senderId: peerId,
        replyToMessage: replyToMessage || null,
      };

      if (rid) useMessageStore.getState().addMessage(rid, message);
      const outgoingMessage = {
        id: message.id,
        username: displayName || "Anonymous",
        avatarSeed: avatarSeed,
        avatarUrl: avatarUrl || null,
        timestamp: message.timestamp,
        content: isEncrypted ? "[encrypted]" : content,
        encryptedContent,
        isVerified:
          isVerified &&
          (badgeVisibility === "Everyone" ||
            (badgeVisibility === "Friends" &&
              !!partnerId &&
              friendList.some((friend) => friend.id === partnerId))),
        isEncrypted,
        replyToMessage: replyToMessage
          ? {
            id: replyToMessage.id,
            content: isEncrypted ? "[encrypted]" : replyToMessage.content,
          }
          : null,
      };
      const outgoingPayload = JSON.stringify({
        type: "chat_message",
        message: outgoingMessage,
      });
      let sentCount = 0;
      openChannels.forEach((channel) => {
        try {
          channel.send(outgoingPayload);
          sentCount += 1;
          traceE2E("chat.message.outbound", {
            messageId: outgoingMessage.id,
            fromPeerId: peerId,
            toPeerId: partnerId ?? null,
            roomId: activeRoomId ?? null,
            transport: "p2p_data_channel",
            channelLabel: channel.label,
            isEncryptedFlag: outgoingMessage.isEncrypted,
            hasEncryptedContent: !!outgoingMessage.encryptedContent,
            encryptionStatus: outgoingMessage.isEncrypted ? "signal_e2e" : "not_encrypted",
          }, "info");
        } catch (err) {
          console.warn("[ChatArea] Failed to send chat message over data channel:", err);
          traceE2E("chat.message.outbound_failed", {
            messageId: outgoingMessage.id,
            fromPeerId: peerId,
            toPeerId: partnerId ?? null,
            transport: "p2p_data_channel",
            error: err instanceof Error ? err.message : String(err),
          }, "warn");
        }
      });
      if (sentCount === 0) {
        if (canUseSignalingFallback && partnerId) {
          try {
            sendChatMessageSignaling(partnerId, outgoingMessage as any);
            traceE2E("chat.message.outbound", {
              messageId: outgoingMessage.id,
              fromPeerId: peerId,
              toPeerId: partnerId,
              roomId: activeRoomId ?? null,
              transport: "signaling_fallback",
              isEncryptedFlag: outgoingMessage.isEncrypted,
              hasEncryptedContent: !!outgoingMessage.encryptedContent,
              encryptionStatus: outgoingMessage.isEncrypted ? "signal_e2e" : "not_encrypted",
            }, "warn");
          } catch (err) {
            traceE2E("chat.message.outbound_failed", {
              messageId: outgoingMessage.id,
              fromPeerId: peerId,
              toPeerId: partnerId,
              transport: "signaling_fallback",
              error: err instanceof Error ? err.message : String(err),
            }, "error");
            if (rid) {
              useMessageStore.getState().removeMessage(rid, message.id);
              useMessageStore.getState().addMessage(rid, {
                id: makeId(),
                username: "System",
                avatarSeed: "",
                avatarUrl: null,
                timestamp: now(),
                content: "⚠ Message could not be sent — fallback signaling failed.",
                isVerified: false,
                replyToMessage: null,
              });
            }
            return;
          }
          setReplyingTo(null);
          setEditingMessage(null);
          updatePeerActivity();
          return;
        }
        if (rid) {
          useMessageStore.getState().removeMessage(rid, message.id);
          useMessageStore.getState().addMessage(rid, {
            id: makeId(),
            username: "System",
            avatarSeed: "",
            avatarUrl: null,
            timestamp: now(),
            content: "⚠ Message could not be sent — all P2P channels failed.",
            isVerified: false,
            replyToMessage: null,
          });
        }
        return;
      }

      if (partnerId && signalingConnected) {
        ackedOutgoingMessagesRef.current.delete(message.id);
        clearPendingSignalFallback(message.id);
        const p2pHealth = partnerId
          ? p2pHealthyPeersRef.current.get(partnerId) ?? null
          : null;
        const hasFreshP2PHealth =
          !!p2pHealth && Date.now() - p2pHealth.lastAckAt < 8_000;
        const partnerPc = partnerId ? getPeerConnection(partnerId) : null;
        const hasConnectedP2P =
          partnerPc?.connectionState === "connected" &&
          partnerPc?.iceConnectionState === "connected";
        const hasRecentP2PHealth =
          !!p2pHealth && Date.now() - p2pHealth.lastAckAt < 30_000;
        const shouldTreatP2PAsHealthy = hasFreshP2PHealth || (hasConnectedP2P && hasRecentP2PHealth);
        if (sentCount > 0 && shouldTreatP2PAsHealthy) {
          traceE2E("chat.message.fallback.skipped_healthy_p2p", {
            messageId: message.id,
            fromPeerId: peerId,
            toPeerId: partnerId,
            sentCount,
            p2pLastRttMs: p2pHealth?.rttMs ?? null,
          }, "info");
          setReplyingTo(null);
          setEditingMessage(null);
          updatePeerActivity();
          return;
        }
        const fallbackDelayMs = shouldTreatP2PAsHealthy
          ? MESSAGE_SIGNAL_FALLBACK_DELAY_WHEN_P2P_HEALTHY_MS
          : MESSAGE_SIGNAL_FALLBACK_DELAY_MS;
        traceE2E("chat.message.fallback.scheduled", {
          messageId: message.id,
          fromPeerId: peerId,
          toPeerId: partnerId,
          fallbackDelayMs,
          p2pHealthy: shouldTreatP2PAsHealthy,
          p2pLastRttMs: p2pHealth?.rttMs ?? null,
        }, shouldTreatP2PAsHealthy ? "debug" : "warn");
        const timer = setTimeout(() => {
          pendingSignalFallbackTimersRef.current.delete(message.id);
          if (ackedOutgoingMessagesRef.current.has(message.id)) {
            traceE2E("chat.message.fallback.cancelled_ack", {
              messageId: message.id,
              fromPeerId: peerId,
              toPeerId: partnerId,
              transport: "signaling_fallback",
            }, "debug");
            return;
          }
          try {
            sendChatMessageSignaling(partnerId, outgoingMessage as any);
            traceE2E("chat.message.outbound", {
              messageId: message.id,
              fromPeerId: peerId,
              toPeerId: partnerId,
              roomId: activeRoomId ?? null,
              transport: "signaling_fallback_retry",
              isEncryptedFlag: outgoingMessage.isEncrypted,
              hasEncryptedContent: !!outgoingMessage.encryptedContent,
              encryptionStatus: outgoingMessage.isEncrypted ? "signal_e2e" : "not_encrypted",
            }, "warn");
          } catch (err) {
            console.warn("[ChatArea] Failed to send chat message over signaling fallback:", err);
            traceE2E("chat.message.outbound_failed", {
              messageId: message.id,
              fromPeerId: peerId,
              toPeerId: partnerId,
              transport: "signaling_fallback_retry",
              error: err instanceof Error ? err.message : String(err),
            }, "error");
          }
        }, fallbackDelayMs);
        pendingSignalFallbackTimersRef.current.set(message.id, timer);
      }

      // Clear reply/edit state after sending
      setReplyingTo(null);
      setEditingMessage(null);
      updatePeerActivity();
    },
    [
      displayName,
      isCryptoReady,
      encryptMessage,
      hasSignalSession,
      isVerified,
      isSignalReady,
      avatarSeed,
      avatarUrl,
      badgeVisibility,
      activeRoomId,
      peerId,
      isDirectConnectMode,
      partnerId,
      friendList,
      signalingConnected,
      waitForDataChannelOpen,
      resolveOpenChatChannels,
      clearPendingSignalFallback,
      markP2PHealthy,
      sendChatMessageSignaling,
      recoverEncryptionSession,
      updatePeerActivity,
    ],
  );

  const handleIncomingChatMessage = useCallback(
    (
      message: IncomingChatMessage,
      from: string,
      transport: "signaling" | "p2p_data_channel" = "signaling",
    ) => {
      const incomingAudio = incomingMessageAudioRef.current;
      if (incomingAudio && useSessionStore.getState().notificationSoundEnabled) {
        try {
          incomingAudio.currentTime = 0;
          incomingAudio.play().catch(() => { });
        } catch (_) { }
      }

      if (import.meta.env.DEV)
        console.log(
          "[ChatArea] Received chat message:",
          message,
          "from:",
          from,
        );
      sendChatDeliveryAck(from, message.id);
      const rid = activeRoomIdRef.current;
      if (rid) {
        const exists = useMessageStore
          .getState()
          .getMessages(rid)
          .some((m) => m.id === message.id);
        if (exists) {
          return;
        }
      }

      const hasEncryptedContent = !!message.encryptedContent;
      const isEncryptedFlag = !!message.isEncrypted;
      const isEncryptedMessage =
        hasEncryptedContent || isEncryptedFlag || message.content === "[encrypted]";
      const canDecrypt = isCryptoReady && hasSignalSession(from);
      if (transport === "p2p_data_channel") {
        markP2PHealthy(from, 1);
      }
      traceE2E("chat.message.inbound", {
        messageId: message.id,
        fromPeerId: from,
        toPeerId: peerId,
        roomId: activeRoomIdRef.current ?? null,
        transport,
        isEncryptedFlag,
        hasEncryptedContent,
        encryptionStatus: isEncryptedMessage ? "claimed_encrypted" : "plaintext",
        canDecrypt,
        hasSignalSession: hasSignalSession(from),
        isSignalReady,
      }, "info");

      if (isEncryptedMessage && !canDecrypt) {
        encryptionCountersRef.current.queued += 1;
        emitEncryptionMetric("encryption_message_queued", from, {
          total: encryptionCountersRef.current.queued,
        });
        enqueuePendingEncryptedMessage(message, from);
        traceE2E("chat.message.inbound_queued", {
          messageId: message.id,
          fromPeerId: from,
          toPeerId: peerId,
          transport,
          queueSize: pendingEncryptedMessagesRef.current.size,
          reason: "session_not_ready",
        }, "warn");
        recoverEncryptionSession(from);
        schedulePendingEncryptedFlush();
        return;
      }

      if (isEncryptedMessage) {
        const encryptedKey = `${from}:${message.id}`;
        const lastHandledAt =
          recentlyHandledEncryptedRef.current.get(encryptedKey) ?? 0;
        if (Date.now() - lastHandledAt < ENCRYPTED_MESSAGE_DEDUPE_TTL_MS) {
          traceE2E("chat.message.inbound_deduped", {
            messageId: message.id,
            fromPeerId: from,
            toPeerId: peerId,
            transport,
            reason: "recently_handled",
          }, "debug");
          return;
        }
        if (decryptInFlightRef.current.has(encryptedKey)) {
          traceE2E("chat.message.inbound_deduped", {
            messageId: message.id,
            fromPeerId: from,
            toPeerId: peerId,
            transport,
            reason: "decrypt_in_flight",
          }, "debug");
          return;
        }
        decryptInFlightRef.current.add(encryptedKey);
        try {
          traceE2E("chat.message.decrypt.start", {
            messageId: message.id,
            fromPeerId: from,
            toPeerId: peerId,
            transport,
            encryptedPayloadFp:
              typeof message.encryptedContent === "string"
                ? fingerprintValue(message.encryptedContent)
                : null,
          }, "debug");
          const decrypted = decryptIncomingContent(message, from);
          addIncomingChatMessage(message, from, decrypted);
          traceE2E("chat.message.decrypt.success", {
            messageId: message.id,
            fromPeerId: from,
            toPeerId: peerId,
            transport,
            plaintextLength: decrypted.length,
            encryptionStatus: "signal_e2e",
          }, "info");
        } catch (err) {
          console.error("[ChatArea] Decryption failed, scheduling retry:", err);
          encryptionCountersRef.current.decryptFail += 1;
          emitEncryptionMetric("encryption_decrypt_failed", from, {
            total: encryptionCountersRef.current.decryptFail,
          });
          traceE2E("chat.message.decrypt.failed", {
            messageId: message.id,
            fromPeerId: from,
            toPeerId: peerId,
            transport,
            error: err instanceof Error ? err.message : String(err),
          }, "error");
          enqueuePendingEncryptedMessage(message, from);
          recoverEncryptionSession(from);
          schedulePendingEncryptedFlush();
        } finally {
          decryptInFlightRef.current.delete(encryptedKey);
        }
        return;
      }
      addIncomingChatMessage(message, from, message.content);
      traceE2E("chat.message.accepted_plaintext", {
        messageId: message.id,
        fromPeerId: from,
        toPeerId: peerId,
        transport,
        plaintextLength: typeof message.content === "string" ? message.content.length : 0,
      }, "warn");
    },
    [
      addIncomingChatMessage,
      decryptIncomingContent,
      enqueuePendingEncryptedMessage,
      emitEncryptionMetric,
      hasSignalSession,
      isCryptoReady,
      isSignalReady,
      peerId,
      recoverEncryptionSession,
      schedulePendingEncryptedFlush,
      sendChatDeliveryAck,
      markP2PHealthy,
    ],
  );

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    const register = (unsubscribe: void | (() => void)) => {
      if (typeof unsubscribe === "function") {
        unsubscribers.push(unsubscribe);
      }
    };

    register(onChatMessage((message, from) => {
      handleIncomingChatMessage(message, from, "signaling");
    }));

    register(onTyping((isTyping, from) => {
      if (from === partnerId && isMountedRef.current) {
        setIsPartnerTyping(isTyping);
      }
    }));

    register(onPeerSkip((from) => {
      const currentPartnerId = useSessionStore.getState().partnerId;
      if (from === currentPartnerId && isMountedRef.current) {
        partnerSkipIntentRef.current.add(from);
        finalizePartnerSkip();
      }
    }));

    register(onPeerLeave((leftPeerId, reason, closeCode) => {
      const currentPartnerId = useSessionStore.getState().partnerId;
      if (leftPeerId === currentPartnerId && isMountedRef.current) {
        const normalizedReason = typeof reason === "string" ? reason.toLowerCase() : "";
        const isSkipLeave =
          closeCode === 4001 ||
          normalizedReason === "skip" ||
          normalizedReason === "intentional_skip";
        const isTransientLeave =
          normalizedReason === "" ||
          normalizedReason === "disconnect" ||
          normalizedReason === "transient_disconnect";
        if (isSkipLeave) {
          partnerSkipIntentRef.current.add(leftPeerId);
          finalizePartnerSkip();
          return;
        }
        if (isTransientLeave) {
          console.log(
            "[ChatArea] Partner transient signaling disconnect — waiting for reconnect",
            { reason, closeCode },
          );
          pendingLeavePeerRef.current = leftPeerId;
          if (partnerLeaveTimerRef.current) {
            clearTimeout(partnerLeaveTimerRef.current);
            partnerLeaveTimerRef.current = null;
          }
          partnerLeaveTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            if (pendingLeavePeerRef.current !== leftPeerId) return;
            finalizePartnerSkip();
          }, PARTNER_RECONNECT_GRACE_MS);
          setIsSignalReady(false);
          keyExchangeInitiatedRef.current = null;
          isReconnectingRef.current = true;
          return;
        }
        if (partnerSkipIntentRef.current.has(leftPeerId)) {
          finalizePartnerSkip();
          return;
        }
        console.log(
          "[ChatArea] Partner signaling disconnected — waiting for reconnect",
          { reason, closeCode },
        );
        pendingLeavePeerRef.current = leftPeerId;
        if (partnerLeaveTimerRef.current) {
          clearTimeout(partnerLeaveTimerRef.current);
        }
        partnerLeaveTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          if (pendingLeavePeerRef.current !== leftPeerId) return;
          finalizePartnerSkip();
        }, PARTNER_RECONNECT_GRACE_MS);
        setIsSignalReady(false);
        keyExchangeInitiatedRef.current = null;
        isReconnectingRef.current = true;
      }
    }));

    register(onPeerJoin((joinedPeerId) => {
      if (
        connectionState === "partner_skipped" ||
        connectionState === "self_skipped"
      ) {
        return;
      }
      const currentPartnerId = useSessionStore.getState().partnerId;
      if (joinedPeerId !== currentPartnerId || !isMountedRef.current) return;

      if (pendingLeavePeerRef.current === joinedPeerId) {
        pendingLeavePeerRef.current = null;
        if (partnerLeaveTimerRef.current) {
          clearTimeout(partnerLeaveTimerRef.current);
          partnerLeaveTimerRef.current = null;
        }
      }
      partnerSkipIntentRef.current.delete(joinedPeerId);
      partnerSkipHandledRef.current = false;

      setConnectionState("connected");
      setIsSignalReady(false);
      keyExchangeInitiatedRef.current = null;
      isReconnectingRef.current = true;

      const myPeerId = useSessionStore.getState().peerId;
      if (myPeerId && currentPartnerId && myPeerId < currentPartnerId) {
        if (p2pInFlightRef.current.has(currentPartnerId)) {
          console.log("[ChatArea] Aborting onPeerJoin initiator — P2P already in flight for", currentPartnerId);
          return;
        }

        const reconnect = async () => {
          p2pInFlightRef.current.add(currentPartnerId);
          try {
            const existingPc = getPeerConnection(currentPartnerId);
            if (
              existingPc &&
              existingPc.signalingState !== "closed" &&
              existingPc.signalingState !== "stable"
            ) {
              console.log(
                "[ChatArea] Reconnect: onPeerJoin skipping offer — signalingState is",
                existingPc.signalingState,
                "for:",
                currentPartnerId,
              );
              return;
            }
            const pc =
              existingPc && existingPc.signalingState !== "closed"
                ? existingPc
                : await createPeerConnection(
                  currentPartnerId,
                  undefined,
                  true,
                );
            if (pc.signalingState !== "stable") {
              console.log(
                "[ChatArea] Reconnect: onPeerJoin skipping offer after PC init — signalingState is",
                pc.signalingState,
                "for:",
                currentPartnerId,
              );
              return;
            }
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendOffer(currentPartnerId, offer);
            console.log(
              "[ChatArea] Reconnect: WebRTC Offer sent to:",
              currentPartnerId,
            );
          } catch (err) {
            console.error("[ChatArea] Reconnect: P2P re-initiation failed:", err);
          } finally {
            p2pInFlightRef.current.delete(currentPartnerId);
          }
        };
        reconnect();
      }
    }));

    register(onKeysRequest((from) => {
      console.log(
        "[ChatArea] [Signal Debug] onKeysRequest received from:",
        from,
        "partnerId:",
        partnerId,
        "isCryptoReady:",
        isCryptoReady,
      );
      traceE2E("chat.key_exchange.request.received", {
        fromPeerId: from,
        toPeerId: peerId,
        partnerId: partnerId ?? null,
        isCryptoReady,
        isSignalReady,
        hasSession: hasSignalSession(from),
      }, "info");
      if (from === partnerId && isCryptoReady) {
        try {
          const nowTs = Date.now();
          const lastResponseAt =
            lastKeysRequestResponseAtRef.current.get(from) ?? 0;
          if (
            isSignalReady &&
            hasSignalSession(from) &&
            !isReconnectingRef.current &&
            nowTs - lastResponseAt < 3000
          ) {
            console.log(
              "[ChatArea] [Signal Debug] Skipping duplicate KeysRequest while session is healthy",
            );
            return;
          }
          lastKeysRequestResponseAtRef.current.set(from, nowTs);
          console.log(
            "[ChatArea] [Signal Debug] Generating pre-key bundle for:",
            from,
          );
          const bundle = generatePreKeyBundle();
          console.log(
            "[ChatArea] [Signal Debug] Pre-key bundle generated:",
            bundle ? "success" : "failed",
          );
          // sendKeysResponse expects an object (or string), let it handle stringification
          sendKeysResponse(from, bundle as any);
          console.log("[ChatArea] [Signal Debug] Keys response sent to:", from);
          traceE2E("chat.key_exchange.response.sent", {
            fromPeerId: peerId,
            toPeerId: from,
            isReconnecting: isReconnectingRef.current,
          }, "info");
        } catch (err) {
          console.error(
            "[ChatArea] [Signal Debug] Error in onKeysRequest:",
            err,
          );
        }
      } else {
        if (from === partnerId && !isCryptoReady) {
          pendingKeysRequestRef.current.add(from);
        }
        console.log(
          "[ChatArea] [Signal Debug] Ignoring onKeysRequest - from:",
          from,
          "=== partnerId:",
          partnerId,
          "?",
          from === partnerId,
          "isCryptoReady:",
          isCryptoReady,
        );
      }
    }));

    register(onKeysResponse((bundleStr, from) => {
      console.log(
        "[ChatArea] [Signal Debug] onKeysResponse received from:",
        from,
        "partnerId:",
        partnerId,
        "isCryptoReady:",
        isCryptoReady,
      );
      // ROLE ENFORCEMENT: Only the initiator (lower peerId) processes KeysResponse → initiateSignalSession.
      // The responder ignores this — they wait for the SignalHandshake instead.
      //
      const myPeerId = useSessionStore.getState().peerId;
      const isInitiator = myPeerId < from;
      traceE2E("chat.key_exchange.response.received", {
        fromPeerId: from,
        toPeerId: peerId,
        isInitiator,
        isCryptoReady,
        isSignalReady,
        hasSession: hasSignalSession(from),
        bundleLength: typeof bundleStr === "string" ? bundleStr.length : null,
        bundleFp: typeof bundleStr === "string" ? fingerprintValue(bundleStr) : null,
      }, "info");
      if (
        from === partnerId &&
        isCryptoReady &&
        isMountedRef.current &&
        isInitiator
      ) {
        try {
          if (
            typeof bundleStr === "string" &&
            isDuplicateKeyPayload(from, "keys_response", bundleStr)
          ) {
            traceE2E("chat.key_exchange.response.duplicate_dropped", {
              fromPeerId: from,
              toPeerId: peerId,
              role: "initiator",
            }, "info");
            return;
          }
          const nowTs = Date.now();
          const lastHandledAt =
            lastKeysResponseHandledAtRef.current.get(from) ?? 0;
          if (
            isSignalReady &&
            hasSignalSession(from) &&
            !isReconnectingRef.current &&
            nowTs - lastHandledAt < 8000
          ) {
            console.log(
              "[ChatArea] [Signal Debug] [Initiator] Ignoring duplicate KeysResponse while session is healthy",
            );
            return;
          }
          if (nowTs - lastHandledAt < 600) {
            return;
          }
          lastKeysResponseHandledAtRef.current.set(from, nowTs);
          console.log(
            "[ChatArea] [Signal Debug] [Initiator] Processing keys response from:",
            from,
            "bundle length:",
            typeof bundleStr === "string" ? bundleStr.length : "object",
          );
          const initiation = initiateSignalSession(from, bundleStr);
          console.log(
            "[ChatArea] [Signal Debug] [Initiator] Signal session initiated, handshake data:",
            initiation ? "generated" : "failed",
          );
          sendHandshake(from, initiation as any);
          console.log(
            "[ChatArea] [Signal Debug] [Initiator] Handshake sent to:",
            from,
          );
          isReconnectingRef.current = false;
          setIsSignalReady(true);
          clearKeyExchangeGate(from);
          schedulePendingEncryptedFlush(0);
          traceE2E("chat.key_exchange.handshake.sent", {
            fromPeerId: peerId,
            toPeerId: from,
            role: "initiator",
            handshakeLength: typeof initiation === "string" ? initiation.length : null,
          }, "info");
        } catch (err) {
          console.error(
            "[ChatArea] [Signal Debug] Failed to initiate Signal session:",
            err,
          );
          isReconnectingRef.current = false; // Reset even on failure
        }
      } else if (!isInitiator) {
        if (
          from === partnerId &&
          isCryptoReady &&
          isMountedRef.current &&
          !isSignalReady &&
          isReconnectingRef.current
        ) {
          try {
            if (
              typeof bundleStr === "string" &&
              isDuplicateKeyPayload(from, "keys_response", bundleStr)
            ) {
              traceE2E("chat.key_exchange.response.duplicate_dropped", {
                fromPeerId: from,
                toPeerId: peerId,
                role: "responder",
              }, "info");
              return;
            }
            const fallbackEligibleAt =
              responderFallbackEligibleAtRef.current.get(from) ?? 0;
            if (!fallbackEligibleAt || Date.now() < fallbackEligibleAt) {
              traceE2E("chat.key_exchange.fallback.gated", {
                fromPeerId: from,
                toPeerId: peerId,
                role: "responder",
                fallbackEligibleAt,
                nowTs: Date.now(),
                hasSession: hasSignalSession(from),
              }, "info");
              return;
            }
            if (hasSignalSession(from)) {
              isReconnectingRef.current = false;
              setIsSignalReady(true);
              clearKeyExchangeGate(from);
              return;
            }
            const nowTs = Date.now();
            const lastHandledAt =
              lastKeysResponseHandledAtRef.current.get(from) ?? 0;
            if (nowTs - lastHandledAt < 600) {
              return;
            }
            lastKeysResponseHandledAtRef.current.set(from, nowTs);
            console.log(
              "[ChatArea] [Signal Debug] [Responder] Recovery fallback: processing KeysResponse to restore session",
            );
            const initiation = initiateSignalSession(from, bundleStr);
            sendHandshake(from, initiation as any);
            setIsSignalReady(true);
            isReconnectingRef.current = false;
            clearKeyExchangeGate(from);
            schedulePendingEncryptedFlush(0);
            traceE2E("chat.key_exchange.handshake.sent", {
              fromPeerId: peerId,
              toPeerId: from,
              role: "responder_recovery_fallback",
              handshakeLength: typeof initiation === "string" ? initiation.length : null,
            }, "warn");
            return;
          } catch (err) {
            console.error(
              "[ChatArea] [Signal Debug] [Responder] Recovery fallback failed:",
              err,
            );
          }
        }
        console.log(
          "[ChatArea] [Signal Debug] [Responder] Ignoring KeysResponse — waiting for SignalHandshake instead",
        );
      } else {
        if (from === partnerId && !isCryptoReady) {
          pendingKeysResponseRef.current.set(from, bundleStr);
        }
        console.log(
          "[ChatArea] [Signal Debug] Ignoring onKeysResponse - from:",
          from,
          "=== partnerId:",
          partnerId,
          "?",
          from === partnerId,
          "isCryptoReady:",
          isCryptoReady,
        );
      }
    }));

    register(onHandshake((initiationStr, from) => {
      console.log(
        "[ChatArea] [Signal Debug] onHandshake received from:",
        from,
        "partnerId:",
        partnerId,
        "isCryptoReady:",
        isCryptoReady,
      );
      // ROLE ENFORCEMENT: Only the responder (higher peerId) processes SignalHandshake → respondToSignalSession.
      // The initiator ignores this — they already have their session from initiateSignalSession.
      const myPeerId = useSessionStore.getState().peerId;
      const isResponder = myPeerId > from;
      traceE2E("chat.key_exchange.handshake.received", {
        fromPeerId: from,
        toPeerId: peerId,
        isResponder,
        isCryptoReady,
        isSignalReady,
        hasSession: hasSignalSession(from),
        initiationLength: typeof initiationStr === "string" ? initiationStr.length : null,
        initiationFp:
          typeof initiationStr === "string" ? fingerprintValue(initiationStr) : null,
      }, "info");
      if (
        from === partnerId &&
        isCryptoReady &&
        isMountedRef.current &&
        isResponder
      ) {
        try {
          if (
            typeof initiationStr === "string" &&
            isDuplicateKeyPayload(from, "handshake", initiationStr)
          ) {
            traceE2E("chat.key_exchange.handshake.duplicate_dropped", {
              fromPeerId: from,
              toPeerId: peerId,
              role: "responder",
            }, "info");
            return;
          }
          const nowTs = Date.now();
          const lastHandledAt =
            lastHandshakeHandledAtRef.current.get(from) ?? 0;
          if (
            isSignalReady &&
            hasSignalSession(from) &&
            !isReconnectingRef.current &&
            nowTs - lastHandledAt < 8000
          ) {
            console.log(
              "[ChatArea] [Signal Debug] [Responder] Ignoring duplicate SignalHandshake while session is healthy",
            );
            return;
          }
          if (nowTs - lastHandledAt < 600) {
            return;
          }
          lastHandshakeHandledAtRef.current.set(from, nowTs);
          console.log(
            "[ChatArea] [Signal Debug] [Responder] Processing handshake from:",
            from,
            "initiation length:",
            typeof initiationStr === "string" ? initiationStr.length : "object",
          );
          respondToSignalSession(from, initiationStr);
          console.log(
            "[ChatArea] [Signal Debug] [Responder] Signal session responded successfully",
          );
          isReconnectingRef.current = false;
          setIsSignalReady(true);
          clearKeyExchangeGate(from);
          schedulePendingEncryptedFlush(0);
          traceE2E("chat.key_exchange.handshake.accepted", {
            fromPeerId: from,
            toPeerId: peerId,
            role: "responder",
            hasSession: hasSignalSession(from),
          }, "info");
        } catch (err) {
          console.error(
            "[ChatArea] [Signal Debug] Failed to respond to Signal handshake:",
            err,
          );
        }
      } else if (!isResponder) {
        console.log(
          "[ChatArea] [Signal Debug] [Initiator] Ignoring SignalHandshake — already have session from initiateSignalSession",
        );
      } else {
        if (from === partnerId && !isCryptoReady && isResponder) {
          pendingHandshakeRef.current.set(from, initiationStr);
        }
        console.log(
          "[ChatArea] [Signal Debug] Ignoring onHandshake - from:",
          from,
          "=== partnerId:",
          partnerId,
          "?",
          from === partnerId,
          "isCryptoReady:",
          isCryptoReady,
        );
      }
    }));

    register(onFriendRequest((action, from, username, avatarSeed, avatarUrl) => {
      console.log(
        "[ChatArea] Received friend request action:",
        action,
        "from:",
        from,
      );
      if (action === "send") {
        if (!friendRequestsEnabled) {
          sendFriendRequestSignaling(from, "decline");
          return;
        }
        handleReceivedFriendRequest({
          id: from,
          username: username || "Partner",
          avatarSeed: avatarSeed || from,
          avatarUrl: avatarUrl || null,
        });
      } else if (action === "accept") {
        acceptFriendRequest(from, username, avatarSeed, avatarUrl);
      } else if (action === "decline") {
        declineFriendRequest(from);
      }
    }));

    register(onProfile((from, username, avatarSeed, incomingAvatarUrl, metadata) => {
      if (metadata) {
        setPeerProfileMeta((prev) => ({
          ...prev,
          [from]: {
            interests: metadata.interests,
            interestsVisibility: metadata.interestsVisibility,
            badgeVisibility: metadata.badgeVisibility,
            joinedAt: metadata.joinedAt ?? null,
          },
        }));
      }
      updatePeerProfile(from, {
        username: username || undefined,
        avatarSeed: avatarSeed || undefined,
        avatarUrl: incomingAvatarUrl,
      });
    }));

    // Screen share state notification from partner
    register(onScreenShare((isSharing, from) => {
      console.log(
        "[ChatArea] Received ScreenShare state from:",
        from,
        "sharing:",
        isSharing,
      );
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
          const videoReceivers = pc
            .getReceivers()
            .filter(
              (r) =>
                r.track &&
                r.track.kind === "video" &&
                r.track.readyState === "live",
            );
          // If there's exactly one live video receiver and remoteSharing isn't
          // set yet, that track was likely misclassified as camera → promote it.
          if (
            videoReceivers.length > 0 &&
            !useScreenShareStore.getState().isRemoteSharing
          ) {
            const lastReceiver = videoReceivers[videoReceivers.length - 1];
            const stream = lastReceiver.track
              ? new MediaStream([lastReceiver.track])
              : null;
            if (stream) {
              console.log(
                "[ChatArea] Late screen-share classification: promoting video track to screen share",
              );
              useScreenShareStore.getState().setRemoteSharing(stream);
            }
          }
        }
        // Even if no track yet, mark the store so ontrack can use this flag
        if (!useScreenShareStore.getState().isRemoteSharing) {
          // Pre-set the flag without a stream — ontrack will replace with actual stream
          useScreenShareStore.getState().setRemoteSharing(null);
        }
      } else {
        // Partner explicitly stopped — clear remote screen share.
        useScreenShareStore.getState().clearRemoteSharing();
      }
    }));

    // Voice chat state notification from partner
    register(onVoiceChat((isMicOn, from) => {
      console.log(
        "[ChatArea] Received VoiceChat state from:",
        from,
        "micOn:",
        isMicOn,
        "expectedPartner:",
        partnerId,
      );
      if (from !== partnerId) return;
      setPartnerMicOn(isMicOn);
    }));

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [
    onChatMessage,
    handleIncomingChatMessage,
    addIncomingChatMessage,
    decryptIncomingContent,
    emitEncryptionMetric,
    hasSignalSession,
    onTyping,
    onPeerLeave,
    onPeerSkip,
    finalizePartnerSkip,
    peerId,
    partnerId,
    disconnectSignaling,
    isCryptoReady,
    isSignalReady,
    onKeysRequest,
    onKeysResponse,
    generatePreKeyBundle,
    sendKeysResponse,
    initiateSignalSession,
    onHandshake,
    respondToSignalSession,
    decryptMessage,
    hasSignalSession,
    sendHandshake,
    setIsSignalReady,
    partnerIsVerified,
    onFriendRequest,
    onProfile,
    leaveRoom,
    setMatchData,
    onScreenShare,
    onVoiceChat,
    setPartnerMicOn,
    getPeerConnection,
    onPeerJoin,
    activeRoomId,
    friendRequestsEnabled,
    isSignalReady,
    recoverEncryptionSession,
    schedulePendingEncryptedFlush,
    connectionState,
    isDuplicateKeyPayload,
    clearKeyExchangeGate,
  ]);

  useEffect(() => {
    if (pendingEncryptedMessagesRef.current.size === 0) return;
    schedulePendingEncryptedFlush(150);
  }, [isCryptoReady, isSignalReady, schedulePendingEncryptedFlush]);

  useEffect(() => {
    return () => {
      pendingSignalFallbackTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingSignalFallbackTimersRef.current.clear();
      p2pProbeTimeoutsRef.current.forEach((timer) => clearTimeout(timer));
      p2pProbeTimeoutsRef.current.clear();
      pendingP2PProbeRef.current.clear();
      p2pHealthyPeersRef.current.clear();
      keyExchangeEpochRef.current.clear();
      keyExchangeModeRef.current.clear();
      responderFallbackEligibleAtRef.current.clear();
      processedKeyPayloadFpRef.current.clear();
      if (pendingDecryptFlushTimerRef.current) {
        clearTimeout(pendingDecryptFlushTimerRef.current);
        pendingDecryptFlushTimerRef.current = null;
      }
      pendingEncryptedMessagesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!signalingConnected) return;
    if (!partnerId && !isDirectConnectMode) return;
    sendProfileToTargets();
  }, [
    signalingConnected,
    partnerId,
    isDirectConnectMode,
    peersInRoom,
    avatarSeed,
    avatarUrl,
    displayName,
    sendProfileToTargets,
  ]);

  const handleAddFriend = useCallback(
    (targetPeerId: string) => {
      if (!targetPeerId) return;
      sendFriendRequestAction(targetPeerId);
      sendFriendRequestSignaling(
        targetPeerId,
        "send",
        displayName,
        useSessionStore.getState().avatarSeed,
        useSessionStore.getState().avatarUrl,
      );
    },
    [sendFriendRequestAction, sendFriendRequestSignaling, displayName],
  );

  const handleAcceptFriendRequest = useCallback(
    (peerId: string) => {
      acceptFriendRequest(peerId);
      sendFriendRequestSignaling(
        peerId,
        "accept",
        displayName,
        useSessionStore.getState().avatarSeed,
        useSessionStore.getState().avatarUrl,
      );
    },
    [acceptFriendRequest, sendFriendRequestSignaling, displayName],
  );

  const handleDeclineFriendRequest = useCallback(
    (peerId: string) => {
      declineFriendRequest(peerId);
      sendFriendRequestSignaling(peerId, "decline");
    },
    [declineFriendRequest, sendFriendRequestSignaling],
  );

  const getFriendRequestStatus = useCallback(
    (targetPeerId: string): "none" | "sent" | "received" | "friends" => {
      if (friendList.some((f) => f.id === targetPeerId)) return "friends";
      if (friendRequestsSent.includes(targetPeerId)) return "sent";
      if (friendRequestsReceived[targetPeerId]) return "received";
      return "none";
    },
    [friendList, friendRequestsSent, friendRequestsReceived],
  );

  const handleTyping = useCallback(
    (isTyping: boolean) => {
      if (sendTypingState && (partnerId || isDirectConnectMode)) {
        const directTargets = isDirectConnectMode
          ? Array.from(new Set(peersInRoom))
          : partnerId
            ? [partnerId]
            : [];
        const targets =
          directTargets.length > 0
            ? directTargets
            : isDirectConnectMode
              ? [""]
              : [];

        targets.forEach((targetPeerId) => {
          const signalKey = targetPeerId || "__room__";
          const now = Date.now();
          const previous = lastTypingSignalRef.current.get(signalKey);
          if (previous && previous.value === isTyping && now - previous.ts < 900) {
            return;
          }
          lastTypingSignalRef.current.set(signalKey, { value: isTyping, ts: now });
          sendTypingState(targetPeerId, isTyping);
        });
      }
      if (isTyping) {
        updatePeerActivity();
      }
    },
    [partnerId, sendTypingState, isDirectConnectMode, peersInRoom, updatePeerActivity],
  );

  const handleVanishOpen = useCallback(
    (messageId: string) => {
      const rid = activeRoomId;
      if (rid)
        useMessageStore.getState().updateMessage(rid, messageId, (m) => {
          if (m.vanishOpened) return m;
          return { ...m, vanishOpened: true };
        });
    },
    [activeRoomId],
  );

  const handleGifSelect = useCallback(
    (gif: any) => {
      const gifUrl = gif.url;
      handleSendMessage(`![gif](${gifUrl})`, replyingTo);
      setIsGifPickerOpen(false);
      handleTyping(false);
    },
    [handleSendMessage, replyingTo, handleTyping],
  );

  const compressImage = useCallback(
    async (file: File): Promise<Blob> => {
      // Only compress images over 500KB or specific types
      if (file.size < 500 * 1024 || !file.type.startsWith("image/")) {
        return file;
      }

      if (!wasm || !wasm.ImageCompressor) {
        console.warn(
          "[ChatArea] WASM/ImageCompressor not ready, sending original",
        );
        return file;
      }

      const compressor = new wasm.ImageCompressor();
      try {
        console.log(
          "[ChatArea] Compressing image:",
          file.name,
          (file.size / 1024).toFixed(1),
          "KB",
        );
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);

        // Shrink to fit under 500KB using JPEG (iteratively reduces dimensions)
        const compressed = compressor.shrink_to_fit(uint8Array, 500);

        const blob = new Blob([compressed], { type: "image/jpeg" });
        console.log(
          "[ChatArea] Compression complete:",
          (blob.size / 1024).toFixed(1),
          "KB",
        );
        if (blob.size >= file.size * 0.95) {
          console.log(
            "[ChatArea] Compression did not reduce size enough, sending original:",
            (file.size / 1024).toFixed(1),
            "KB",
          );
          return file;
        }
        return blob;
      } catch (err) {
        console.error("[ChatArea] Compression failed, sending original:", err);
        return file;
      } finally {
        try {
          compressor.free();
        } catch (e) {
          console.warn("[ChatArea] Failed to free compressor:", e);
        }
      }
    },
    [wasm],
  );

  const handleSelectFiles = useCallback(
    async (files: File[]) => {
      console.log("[ChatArea] handleSelectFiles called:", files.length);
      if (!partnerId) {
        console.warn("[ChatArea] Cannot send files: No partnerId");
        return;
      }

      const rid = activeRoomId;
      const msgStore = useMessageStore.getState();

      // Process files sequentially to avoid chunk interleaved issues on the same data channel
      for (const file of files) {
        // Compress if it's an image
        const processedBlob = file.type.startsWith("image/")
          ? await compressImage(file)
          : file;
        const transferFile =
          processedBlob instanceof File
            ? processedBlob
            : new File(
              [processedBlob],
              processedBlob.type === "image/webp"
                ? `${file.name.replace(/\.[^/.]+$/, "") || "image"}.webp`
                : file.name || "file",
              {
                type:
                  processedBlob.type ||
                  file.type ||
                  "application/octet-stream",
                lastModified: Date.now(),
              },
            );
        const url = URL.createObjectURL(processedBlob);
        blobUrlsRef.current.add(url);
        const messageId = makeId();

        // Async closure validation check: if user hit Skip while compressing, active room changed. 
        if (activeRoomIdRef.current !== activeRoomId) {
          console.warn("[ChatArea] Room changed during file compression. Aborting send to save bandwidth.");
          continue;
        }

        // Add local message for the image immediately so user sees progress
        if (rid)
          msgStore.addMessage(rid, {
            id: messageId,
            username: "Me",
            avatarSeed: avatarSeed,
            timestamp: now(),
            content: `![image](${url})`,
            isVerified:
              isVerified &&
              (badgeVisibility === "Everyone" ||
                (badgeVisibility === "Friends" &&
                  !!partnerId &&
                  friendList.some((friend) => friend.id === partnerId))),
            senderId: peerId,
            status: "sending",
            progress: 0,
            isVanish: isVanishMode,
          });

        // Re-capture channel after potentially long compression yield
        let channel = fileTransferChannelRef.current;

        // If channel is null but we are connected, wait for it to be created
        if (!channel && connectionState === "connected") {
          console.log(
            "[ChatArea] DataChannel is null, waiting for initialization...",
          );

          // Use the new helper function to wait for data channel with extended timeout
          const channelOpened = await waitForDataChannelOpen(partnerId, 20000);
          if (!channelOpened) {
            console.warn(
              "[ChatArea] DataChannel failed to open within timeout",
            );
            if (rid)
              msgStore.updateMessage(rid, messageId, (m) => ({
                ...m,
                status: "error",
                content:
                  "Failed to send: P2P Connection timed out waiting for data channel.",
              }));
            continue;
          }

          channel = fileTransferChannelRef.current;
        }

        if (!channel || channel.readyState !== "open") {
          console.warn(
            "[ChatArea] DataChannel not ready for file transfer (final state:",
            channel?.readyState || "null",
            ")",
          );
          if (rid)
            msgStore.updateMessage(rid, messageId, (m) => ({
              ...m,
              status: "error",
              content: "Failed to send: P2P Connection not ready.",
            }));
          continue;
        }

        let sendError: unknown = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const activeChannel =
            attempt === 0 ? channel : fileTransferChannelRef.current;
          if (!activeChannel || activeChannel.readyState !== "open") {
            sendError = new Error("P2P Connection not ready");
            if (!partnerId) break;
            const channelOpened = await waitForDataChannelOpen(partnerId, 10000);
            if (!channelOpened) break;
            continue;
          }
          try {
            console.log("[ChatArea] Starting file send for:", file.name, "attempt", attempt + 1);
            await sendFile(activeChannel, transferFile, isVanishMode, (p) => {
              if (rid)
                useMessageStore
                  .getState()
                  .updateMessage(rid, messageId, (m) => ({ ...m, progress: p }));
            });
            sendError = null;
            break;
          } catch (err) {
            sendError = err;
            const errorMessage =
              err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
            const retryable =
              attempt === 0 &&
              (errorMessage.includes("network") ||
                errorMessage.includes("datachannel") ||
                errorMessage.includes("readystate") ||
                errorMessage.includes("not open"));
            if (!retryable || !partnerId) {
              break;
            }
            const channelOpened = await waitForDataChannelOpen(partnerId, 10000);
            if (!channelOpened || !isDataChannelOpen(partnerId)) {
              break;
            }
          }
        }

        if (!sendError) {
          if (rid)
            msgStore.updateMessage(rid, messageId, (m) => ({
              ...m,
              status: "sent",
              progress: 100,
            }));
          continue;
        }

        console.error("[ChatArea] File send failed:", sendError);
        if (rid)
          msgStore.updateMessage(rid, messageId, (m) => ({
            ...m,
            status: "error",
            content: `Failed to send: ${sendError instanceof Error ? sendError.message : "Network error. Please retry."}`,
          }));
      }
    },
    [
      partnerId,
      isVerified,
      sendFile,
      compressImage,
      connectionState,
      isVanishMode,
      avatarSeed,
      activeRoomId,
      waitForDataChannelOpen,
      isDataChannelOpen,
    ],
  );

  // ── Match History: Record match on success ──────────────────────────
  const recordedRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      connectionState === "connected" &&
      partnerId &&
      activeRoomId &&
      activeRoomId !== recordedRoomIdRef.current
    ) {
      if (isDirectConnectMode) return; // Don't record group/help rooms in match history

      console.log("[ChatArea] Recording match in history:", partnerId);
      recordedRoomIdRef.current = activeRoomId;
      addMatchToHistory({
        id: partnerId,
        username: partner?.name || partnerName || "Stranger",
        avatarSeed: partner?.avatarSeed || partnerAvatarSeed || partnerId,
        avatarUrl: partnerAvatarUrl,
        timestamp: new Date().toISOString(),
        isVerified: partnerIsVerified,
      });
    }
  }, [
    connectionState,
    partnerId,
    activeRoomId,
    isDirectConnectMode,
    partner,
    partnerName,
    partnerAvatarSeed,
    partnerAvatarUrl,
    partnerIsVerified,
    addMatchToHistory,
  ]);

  // Log state transitions for debugging
  useEffect(() => {
    console.log(
      `[ChatArea] state transition: ${connectionState}, isMatching: ${isMatching}, hasMatch: ${!!matchData}`,
    );
  }, [connectionState, isMatching, matchData]);

  // AUTO-START: If landing in chat area, begin searching automatically (ONCE)
  // But NOT if we have a roomId (reconnect mode — the room already exists)
  // Also skip auto-start in direct-connect mode (private/help/admin rooms)
  const hasAutoStarted = useRef(false);
  useEffect(() => {
    if (urlRoomId) return; // Reconnect mode — don't auto-search
    if (isDirectConnectMode) return; // Direct-connect mode — no matchmaker
    if (
      !hasAutoStarted.current &&
      connectionState === "idle" &&
      !matchData &&
      !isMatching
    ) {
      if (
        typeof sessionStorage !== "undefined" &&
        safeSessionStorage.getItem(SUPPRESS_AUTO_START_ONCE_KEY) === "1"
      ) {
        safeSessionStorage.removeItem(SUPPRESS_AUTO_START_ONCE_KEY);
        hasAutoStarted.current = true;
        return;
      }
      hasAutoStarted.current = true;
      console.log("[ChatArea] Auto-starting search on mount");
      startSearching();
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
    const directRoomId =
      roomType === "help"
        ? "buzzu-help-channel"
        : roomType === "admin"
          ? "buzzu-admin-channel"
          : `private-${urlRoomId || "unknown"}`;

    console.log(
      `[ChatArea] Direct-connect to ${roomType} room: ${directRoomId}`,
    );
    setConnectionState("searching");

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
    if (signalingConnected && connectionState === "searching") {
      console.log(
        "[ChatArea] Direct-connect: signaling connected, transitioning to connected",
      );
      setConnectionState("connected");
      setIsSignalReady(true); // No E2E key exchange needed for group rooms
    }
  }, [isDirectConnectMode, signalingConnected, connectionState]);

  // ── RoomStatus handler ──────────────────────────────────────────────
  useEffect(() => {
    onRoomStatus((status, activePeers, maxPeers) => {
      console.log(
        `[ChatArea] RoomStatus: ${status}, peers: ${activePeers}/${maxPeers}`,
      );
      setRoomStatus({
        status,
        activePeers: activePeers ?? 0,
        maxPeers: maxPeers ?? 0,
      });
      if (status === "waiting") {
        setConnectionState("waiting");
      } else if (status === "admitted") {
        setConnectionState("connected");
        setIsSignalReady(true);
      }
    });
  }, [onRoomStatus]);

  // RECONNECT MODE: If we have a roomId from the URL, reconnect to the existing room
  // This fires when navigating back to /chat/new/:roomId after visiting a DM
  const hasReconnected = useRef(false);
  useEffect(() => {
    if (!urlRoomId || hasReconnected.current) return;
    if (
      connectionState === "partner_skipped" ||
      connectionState === "self_skipped"
    ) {
      return;
    }

    // We need partner info from the store (persisted via localStorage)
    const state = useSessionStore.getState();
    if (state.currentRoomId !== urlRoomId || !state.partnerId || !state.peerId) {
      console.log(
        "[ChatArea] Reconnect: Room ID mismatch or no partner info, falling back to dashboard",
      );
      navigate("/chat/new", { replace: true });
      return;
    }
    if (state.peerId === state.partnerId) {
      console.warn(
        "[ChatArea] Reconnect: peerId equals partnerId, resetting chat state",
      );
      navigate("/chat/new", { replace: true });
      return;
    }

    hasReconnected.current = true;
    console.log(
      "[ChatArea] Reconnecting to room:",
      urlRoomId,
      "partner:",
      state.partnerId,
    );

    // Restore local component state from the persisted store
    setConnectionState("connected");
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
  }, [urlRoomId, connectionState, connectSignaling, navigate]);

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
    if (p2pInFlightRef.current.has(state.partnerId)) return;

    const initReconnect = async () => {
      const partnerId = state.partnerId;
      if (!partnerId) return;
      p2pInFlightRef.current.add(partnerId);
      try {
        const existingPc = getPeerConnection(partnerId);
        if (
          existingPc &&
          existingPc.signalingState !== "closed" &&
          existingPc.signalingState !== "stable"
        ) {
          console.log(
            "[ChatArea] Reconnect: skipping offer — signalingState is",
            existingPc.signalingState,
            "for:",
            partnerId,
          );
          p2pInitRoomRef.current = urlRoomId;
          return;
        }

        const pc =
          existingPc && existingPc.signalingState !== "closed"
            ? existingPc
            : await createPeerConnection(partnerId, undefined, true);
        if (pc.signalingState !== "stable") {
          console.log(
            "[ChatArea] Reconnect: skipping offer after PC init — signalingState is",
            pc.signalingState,
            "for:",
            partnerId,
          );
          p2pInitRoomRef.current = urlRoomId;
          return;
        }
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendOffer(partnerId, offer);
        p2pInitRoomRef.current = `done:${urlRoomId}`;
        console.log(
          "[ChatArea] Reconnect: WebRTC Offer sent to:",
          partnerId,
        );
      } catch (err) {
        console.error("[ChatArea] Reconnect: P2P re-initiation failed:", err);
        p2pInitRoomRef.current = urlRoomId; // allow retry
      } finally {
        p2pInFlightRef.current.delete(partnerId);
      }
    };
    initReconnect();
  }, [
    urlRoomId,
    signalingConnected,
    peersInRoom,
    createPeerConnection,
    getPeerConnection,
    sendOffer,
  ]);

  // Reconnect key exchange — split into its own effect so it retries
  // when isCryptoReady flips to true (WASM may load after the main
  // reconnect effect has already fired).
  // Uses same robustness pattern as primary key exchange: wait for
  // signalingConnected AND partner in peersInRoom.
  useEffect(() => {
    if (
      !urlRoomId ||
      !hasReconnected.current ||
      !isCryptoReady ||
      !signalingConnected
    )
      return;

    const state = useSessionStore.getState();
    if (!state.partnerId) return;

    // Wait for partner to be in the room before requesting keys
    if (!peersInRoom.includes(state.partnerId)) return;

    const partnerId = state.partnerId;
    if (!partnerId) return;

    if (keyExchangeInitiatedRef.current === urlRoomId) {
      // Already initiated — set up a retry in case the messages were lost.
      const retryTimer = setTimeout(() => {
        if (isSignalReady) return;
        console.log(
          "[ChatArea] Reconnect: Key exchange retry — isSignalReady still false after 4s",
        );
        keyExchangeInitiatedRef.current = null; // allow next effect run to re-initiate
        isReconnectingRef.current = false; // reset so it re-sets cleanly
        try {
          beginKeyExchangeCycle(partnerId, "reconnect");
          requestKeys(partnerId);
        } catch (_) {
          /* ignore */
        }
      }, 4000);
      return () => clearTimeout(retryTimer);
    }

    try {
      // Signal the onKeysResponse callback to bypass role enforcement.
      // See comment on isReconnectingRef declaration for full rationale.
      isReconnectingRef.current = true;
      beginKeyExchangeCycle(partnerId, "reconnect");
      clearSignalSession(partnerId);
      const bundle = generatePreKeyBundle();
      publishKeys(bundle as any);
      // Both peers request keys for redundancy (role enforcement in callbacks)
      requestKeys(partnerId);
      keyExchangeInitiatedRef.current = urlRoomId;
      console.log(
        "[ChatArea] Reconnect: Published keys & requested partner keys (isReconnecting=true)",
      );
    } catch (err) {
      console.error("[ChatArea] Reconnect: Key exchange failed:", err);
      isReconnectingRef.current = false;
    }
  }, [
    urlRoomId,
    isCryptoReady,
    signalingConnected,
    peersInRoom,
    isSignalReady,
    generatePreKeyBundle,
    publishKeys,
    requestKeys,
    clearSignalSession,
    beginKeyExchangeCycle,
  ]);

  const receiveChunkRef = useRef(receiveChunk);
  const handleIncomingChatMessageRef = useRef(handleIncomingChatMessage);
  const clearPendingSignalFallbackRef = useRef(clearPendingSignalFallback);
  const markP2PHealthyRef = useRef(markP2PHealthy);
  const sendP2PProbeRef = useRef(sendP2PProbe);
  const finalizePartnerSkipRef = useRef(finalizePartnerSkip);
  const peerIdRef = useRef(peerId);

  useEffect(() => {
    receiveChunkRef.current = receiveChunk;
    handleIncomingChatMessageRef.current = handleIncomingChatMessage;
    clearPendingSignalFallbackRef.current = clearPendingSignalFallback;
    markP2PHealthyRef.current = markP2PHealthy;
    sendP2PProbeRef.current = sendP2PProbe;
    finalizePartnerSkipRef.current = finalizePartnerSkip;
    peerIdRef.current = peerId;
  }, [
    receiveChunk,
    handleIncomingChatMessage,
    clearPendingSignalFallback,
    markP2PHealthy,
    sendP2PProbe,
    finalizePartnerSkip,
    peerId,
  ]);

  // ── Data Channel Registration ──────────────────────────────────────
  // Separated from the match effect so it doesn't re-register on every
  // matchData/partner change. onDataChannel is a ref setter — last-writer-wins.
  useEffect(() => {
    devLog("[ChatArea] Registering onDataChannel callback");
    onDataChannel((channel, from) => {
      devLog(
        "[ChatArea] onDataChannel callback triggered",
        channel.label,
        channel.readyState,
      );
      if (channel.label === "file-transfer") {
        fileTransferChannelRef.current = channel;
        const existingTeardown = dataChannelTeardownRef.current.get(channel);
        if (existingTeardown && wiredFileTransferChannelsRef.current.has(channel)) {
          return;
        }
        wiredFileTransferChannelsRef.current.add(channel);

        // Use addEventListener instead of onopen/onclose/onerror so we don't
        // overwrite the handlers useWebRTC already set for dataChannelOpenStatesRef tracking.
        const handleOpen = () => {
          devLog("[ChatArea] File transfer channel OPEN");
          fileTransferChannelRef.current = channel;
          sendP2PProbeRef.current(channel, from);
        };

        const handleMessage = (event: MessageEvent<string | Blob | ArrayBuffer>) => {
          devLog("[ChatArea] Received data on channel", typeof event.data);

          // Handle delete/edit messages via data channel (P2P)
          if (typeof event.data === "string") {
            const msg = parseDataChannelControlMessage(event.data);
            if (!msg) {
              receiveChunkRef.current(event.data);
              return;
            }
            if (msg.type === "delete_message") {
              devLog("[ChatArea] Received delete_message via data channel");
              const rid = activeRoomIdRef.current;
              if (rid) {
                const targetMessage = useMessageStore
                  .getState()
                  .getMessages(rid)
                  .find((m) => m.id === msg.messageId);
                if (targetMessage && targetMessage.senderId === from) {
                  useMessageStore.getState().removeMessage(rid, msg.messageId);
                }
              }
            } else if (msg.type === "edit_message") {
              devLog("[ChatArea] Received edit_message via data channel");
              const rid = activeRoomIdRef.current;
              if (rid) {
                const targetMessage = useMessageStore
                  .getState()
                  .getMessages(rid)
                  .find((m) => m.id === msg.messageId);
                if (targetMessage && targetMessage.senderId === from) {
                  useMessageStore
                    .getState()
                    .updateMessage(rid, msg.messageId, (m) => ({
                      ...m,
                      content: msg.content,
                      isEdited: true,
                    }));
                }
              }
            } else if (msg.type === "chat_message") {
              markP2PHealthyRef.current(from, 1);
              handleIncomingChatMessageRef.current(
                msg.message,
                from,
                "p2p_data_channel",
              );
            } else if (msg.type === "chat_ack") {
              ackedOutgoingMessagesRef.current.add(msg.messageId);
              clearPendingSignalFallbackRef.current(msg.messageId);
              markP2PHealthyRef.current(from, 1);
              traceE2E("chat.ack.inbound", {
                messageId: msg.messageId,
                fromPeerId: from,
                toPeerId: peerIdRef.current,
                transport: "p2p_data_channel",
              }, "debug");
            } else if (msg.type === "p2p_probe") {
              markP2PHealthyRef.current(from, 1);
              const ackPayload = JSON.stringify({
                type: "p2p_probe_ack",
                probeId: msg.probeId,
                sentAt: msg.sentAt,
                ackAt: Date.now(),
              });
              traceE2E("chat.p2p.probe.received", {
                probeId: msg.probeId,
                fromPeerId: from,
                toPeerId: peerIdRef.current,
                channelLabel: channel.label,
              }, "debug");
              try {
                channel.send(ackPayload);
              } catch (err) {
                traceE2E("chat.p2p.probe.ack_send_failed", {
                  probeId: msg.probeId,
                  fromPeerId: peerIdRef.current,
                  toPeerId: from,
                  error: err instanceof Error ? err.message : String(err),
                }, "warn");
              }
            } else if (msg.type === "p2p_probe_ack") {
              const pending = pendingP2PProbeRef.current.get(msg.probeId);
              if (pending) {
                pendingP2PProbeRef.current.delete(msg.probeId);
              }
              const timeout = p2pProbeTimeoutsRef.current.get(msg.probeId);
              if (timeout) {
                clearTimeout(timeout);
                p2pProbeTimeoutsRef.current.delete(msg.probeId);
              }
              const rttMs = Math.max(0, Date.now() - msg.sentAt);
              markP2PHealthyRef.current(from, rttMs);
              traceE2E("chat.p2p.probe.ack_received", {
                probeId: msg.probeId,
                fromPeerId: from,
                toPeerId: peerIdRef.current,
                rttMs,
                hadPendingProbe: !!pending,
              }, "info");
            } else if (msg.type === "skip_signal") {
              const currentPartnerId = useSessionStore.getState().partnerId;
              if (from === currentPartnerId && isMountedRef.current) {
                partnerSkipIntentRef.current.add(from);
                finalizePartnerSkipRef.current();
              }
            }
          } else if (event.data instanceof ArrayBuffer) {
            receiveChunkRef.current(event.data);
          } else if (event.data instanceof Blob) {
            void event.data
              .arrayBuffer()
              .then((buffer) => {
                receiveChunkRef.current(buffer);
              })
              .catch((err) => {
                devWarn("[ChatArea] Failed to read blob data-channel chunk", err);
              });
          }
        };
        const handleClose = () => {
          devLog("[ChatArea] File transfer channel CLOSED");
          if (fileTransferChannelRef.current === channel) {
            fileTransferChannelRef.current = null;
          }
          wiredFileTransferChannelsRef.current.delete(channel);
          const teardown = dataChannelTeardownRef.current.get(channel);
          teardown?.();
          dataChannelTeardownRef.current.delete(channel);
        };
        const handleError = (err: Event | RTCErrorEvent) => {
          // Ignore 'User-Initiated Abort' which occurs intentionally during 
          // ICE restarts or TURN fallbacks when we close the old channel.
          const rtcError = err as RTCErrorEvent;
          const errorName = rtcError?.error?.name;
          const message = (rtcError as unknown as { message?: string })?.message;
          if (errorName === "OperationError" || message?.includes("Abort")) {
            devLog("[ChatArea] Ignoring intentional data channel abort during recovery");
            return;
          }
          console.error("[ChatArea] File transfer channel ERROR:", err);
        };

        channel.addEventListener("open", handleOpen);
        channel.addEventListener("message", handleMessage);
        channel.addEventListener("close", handleClose);
        channel.addEventListener("error", handleError);
        dataChannelTeardownRef.current.set(channel, () => {
          channel.removeEventListener("open", handleOpen);
          channel.removeEventListener("message", handleMessage);
          channel.removeEventListener("close", handleClose);
          channel.removeEventListener("error", handleError);
        });
      }
    });
    return () => {
      dataChannelTeardownRef.current.forEach((teardown) => teardown());
      dataChannelTeardownRef.current.clear();
    };
  }, [
    devLog,
    devWarn,
    onDataChannel,
  ]);

  useEffect(() => {
    if (urlRoomId) return;

    if (matchData) {
      if (handledMatchId.current === matchData.room_id) {
        console.log(
          "[ChatArea] Match already handled, skipping init:",
          matchData.room_id,
        );
        return;
      }
      console.log("[ChatArea] Handling new match:", matchData.room_id);
      handledMatchId.current = matchData.room_id;
      keyExchangeInitiatedRef.current = null;

      const resolvedName = partnerName || "Partner";
      const resolvedAvatarSeed =
        partnerAvatarSeed || matchData.partner_avatar_seed || matchData.partner_id;

      setConnectionState("connected");
      setPartner({ name: resolvedName, avatarSeed: resolvedAvatarSeed });

      // Persist match state in the store — Header, SidebarList, and useWebRTC
      // all read from the store to show @partnerName and preserve connections.
      joinRoom(
        matchData.room_id,
        matchData.partner_id,
        matchData.partner_is_verified ?? false,
        resolvedName,
        resolvedAvatarSeed,
        matchData.partner_avatar_url || null,
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
        if (prev === "partner_skipped" || prev === "self_skipped" || isMatching)
          return prev;
        return "idle";
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
  }, [
    urlRoomId,
    matchData,
    partnerName,
    partnerAvatarSeed,
    connectSignaling,
    isCryptoReady,
    generatePreKeyBundle,
    publishKeys,
    requestKeys,
    isMatching,
  ]);

  useEffect(() => {
    if (!partnerId) return;
    const incomingName = partnerName?.trim();
    const incomingAvatarSeed = partnerAvatarSeed || partnerId;
    const fallbackName = funAnimalName(partnerId);
    setPartner((current) => {
      const currentName = current?.name?.trim() || "";
      const currentIsFallback =
        !currentName ||
        currentName === "Partner" ||
        currentName === "Stranger" ||
        currentName === "Anonymous" ||
        currentName === fallbackName;
      const nextName =
        incomingName && incomingName.length > 0
          ? incomingName
          : currentIsFallback
            ? "Partner"
            : currentName;
      const nextAvatarSeed = incomingAvatarSeed || current?.avatarSeed || partnerId;
      if (
        current &&
        current.name === nextName &&
        current.avatarSeed === nextAvatarSeed
      ) {
        return current;
      }
      return {
        name: nextName,
        avatarSeed: nextAvatarSeed,
      };
    });
  }, [partnerId, partnerName, partnerAvatarSeed]);

  useEffect(() => {
    if (urlRoomId) return;

    if (matchData && signalingConnected && peerId && matchData.partner_id) {
      if (peerId < matchData.partner_id) {
        const roomId = matchData.room_id;
        if (p2pInitRoomRef.current === roomId) return;
        if (p2pInFlightRef.current.has(matchData.partner_id)) return;

        p2pInitRoomRef.current = roomId;

        devLog("[ChatArea] Reactive P2P Initiation started");
        const roomSnapshot = matchData.room_id;
        const partnerSnapshot = matchData.partner_id;
        const initiate = async () => {
          const state = useSessionStore.getState();
          if (
            state.currentRoomId !== roomSnapshot ||
            state.partnerId !== partnerSnapshot
          ) {
            devWarn("[ChatArea] Skipping stale P2P initiation timer");
            return;
          }
          p2pInFlightRef.current.add(partnerSnapshot);
          try {
            const pc = await createPeerConnection(
              partnerSnapshot,
              undefined,
              true,
            );

            // DO NOT override pc.onconnectionstatechange / pc.oniceconnectionstatechange
            // — the handlers set by createPeerConnection contain critical logic
            // (ICE restart backoff, intentional leave guards, sender tuning).

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendOffer(partnerSnapshot, offer);
            devLog("[ChatArea] WebRTC Offer sent");

            // If screen sharing was active before skip, reattach to
            // the new PC (tunes senders, wires ended listener, starts stats).
            // Tracks were already added by createPeerConnectionWrapper, so
            // reattachToPC only handles tuning and lifecycle hooks.
            if (isLocalScreenSharing) {
              const reattached = await reattachScreenShare(pc, () =>
                requestRenegotiation(
                  partnerSnapshot,
                  "screen-share-reattach",
                ),
              );
              if (reattached) {
                devLog("[ChatArea] Screen share reattached to new PC");
              }
            }
          } catch (err) {
            console.error("[ChatArea] Reactive P2P Initiation failed:", err);
            p2pInitRoomRef.current = null; // Allow retry
          } finally {
            p2pInFlightRef.current.delete(partnerSnapshot);
          }
        };

        // Use a non-cancellable timeout — the ref guard prevents double-initiation,
        // and returning a cleanup was causing the timer to be killed on effect re-runs.
        p2pInitTimerRef.current = setTimeout(() => {
          void initiate();
        }, 500);
      }
    }
  }, [
    urlRoomId,
    matchData,
    signalingConnected,
    peerId,
    createPeerConnection,
    requestRenegotiation,
    isLocalScreenSharing,
    reattachScreenShare,
    devLog,
    devWarn,
  ]);

  // ── Screen Share: Auto-resume after new match ─────────────────────
  // If local screen sharing was active before the skip/leave:
  //   1. Notify the new partner via signaling (ScreenShare=true)
  //   2. Reattach to the new PC (tune senders, wire ended listener, stats)
  // The tracks are already re-added to the PC by createPeerConnectionWrapper.
  const screenShareResumedForRoom = useRef<string | null>(null);
  useEffect(() => {
    if (urlRoomId) return;
    if (!matchData || !signalingConnected || !isLocalScreenSharing) return;
    // Only send once per room
    if (screenShareResumedForRoom.current === matchData.room_id) return;
    screenShareResumedForRoom.current = matchData.room_id;

    console.log(
      "[ChatArea] Auto-resuming screen share signal for new partner:",
      matchData.partner_id,
    );

    // Reattach to new PC (handles both initiator and responder).
    // Uses a delay to ensure the PC exists (responder gets it via handleOffer).
    const timer = setTimeout(async () => {
      const pc = getPeerConnection(matchData.partner_id);
      if (pc && pc.signalingState !== "closed") {
        const reattached = await reattachScreenShare(pc, () =>
          requestRenegotiation(
            matchData.partner_id,
            "screen-share-auto-resume",
          ),
        );
        if (reattached) {
          console.log(
            "[ChatArea] Screen share reattached (auto-resume) for:",
            matchData.partner_id,
          );
        }
      }
      // Signal the new partner that we're screen sharing
      sendScreenShareState(matchData.partner_id, true);

      // Reattach mic if the stream exists (even if currently soft-muted)
      const voiceState = useVoiceChatStore.getState();
      if (voiceState.localAudioStream) {
        const micReattached = await reattachVoiceChat(pc, () =>
          requestRenegotiation(matchData.partner_id, "voice-chat-reattach"),
        );
        if (micReattached) {
          console.log(
            "[ChatArea] Mic reattached (auto-resume) for:",
            matchData.partner_id,
          );
          sendVoiceChatState(matchData.partner_id, voiceState.isMicOn);
        }
      }
    }, 1200);
    return () => clearTimeout(timer);
  }, [
    urlRoomId,
    matchData,
    signalingConnected,
    isLocalScreenSharing,
    sendScreenShareState,
    isMicOn,
    sendVoiceChatState,
    getPeerConnection,
    reattachScreenShare,
    reattachVoiceChat,
    requestRenegotiation,
  ]);

  // Dedicated Signal Key Exchange Effect
  // TIMING FIX: Wait for signalingConnected AND partner in peersInRoom.
  // Without this, RequestKeys is queued → flushed before the responder connects
  // → server silently drops it → key exchange never completes.
  //
  // BOTH peers publish keys AND request keys for redundancy. The role
  // enforcement in onKeysResponse / onHandshake callbacks ensures only the
  // correct peer (initiator vs responder) processes each message.
  useEffect(() => {
    if (urlRoomId) return;
    if (!matchData || !isCryptoReady || !signalingConnected || isSignalReady)
      return;

    const partnerInRoom = peersInRoom.includes(matchData.partner_id);
    if (!partnerInRoom) {
      console.log(
        "[ChatArea] [Signal Debug] Waiting for partner to join room before key exchange",
      );
      return;
    }

    if (keyExchangeInitiatedRef.current === matchData.room_id) {
      // Already initiated — set up a retry in case the messages were lost.
      const retryTimer = setTimeout(() => {
        if (isSignalReady) return;
        console.log(
          "[ChatArea] [Signal Debug] Key exchange retry — isSignalReady still false after 3s",
        );
        keyExchangeInitiatedRef.current = null; // Allow the next effect run to re-initiate
        // Force a re-run by requesting keys again (the effect won't re-fire on ref
        // change alone, but the requestKeys send itself will succeed or fail fast).
        try {
          beginKeyExchangeCycle(matchData.partner_id, "normal");
          requestKeys(matchData.partner_id);
        } catch (_) {
          /* ignore */
        }
      }, 3000);
      return () => clearTimeout(retryTimer);
    }

    const isInitiator = peerId < matchData.partner_id;
    console.log(
      "[ChatArea] [Signal Debug] Key exchange start: partner in room ✓, signalingConnected ✓, isInitiator:",
      isInitiator,
    );

    try {
      beginKeyExchangeCycle(matchData.partner_id, "normal");
      const bundle = generatePreKeyBundle();
      publishKeys(bundle as any);
      // BOTH peers request keys — redundancy in case one direction's message is lost.
      requestKeys(matchData.partner_id);
      keyExchangeInitiatedRef.current = matchData.room_id;
      console.log(
        "[ChatArea] [Signal Debug]",
        isInitiator ? "[Initiator]" : "[Responder]",
        "Published keys & requested partner keys",
      );
    } catch (err) {
      console.error(
        "[ChatArea] [Signal Debug] Error during key exchange:",
        err,
      );
    }
  }, [
    urlRoomId,
    matchData,
    isCryptoReady,
    signalingConnected,
    peersInRoom,
    isSignalReady,
    generatePreKeyBundle,
    publishKeys,
    requestKeys,
    peerId,
    beginKeyExchangeCycle,
  ]);

  return (
    <main className="w-full max-w-full flex h-full flex-grow flex-col overflow-hidden bg-background relative min-w-0">
      <div className="flex w-full h-full overflow-hidden min-w-0">
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <div className="flex-grow overflow-hidden flex flex-col min-w-0 relative">
            {/* Direct-connect room header */}
            {isDirectConnectMode && connectionState === "connected" && (
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-panel/80 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-brightness capitalize">
                    {roomType === "help"
                      ? "💬 Help Channel"
                      : roomType === "admin"
                        ? "🛡️ Admin Channel"
                        : `🔒 ${urlRoomId || "Private Room"}`}
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
                  {/* Connection Type Indicator */}
                  {partnerId && <ConnectionIndicator size="sm" />}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsPeerListOpen(!isPeerListOpen)}
                    className={`text-xs px-2 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${isPeerListOpen ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-white/5"}`}
                  >
                    <Users className="w-4 h-4" />
                    <span className="hidden sm:inline">Peers</span>
                  </button>
                  <button
                    onClick={() => {
                      disconnectSignaling();
                      onLeaveRoom?.();
                    }}
                    className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    Leave
                  </button>
                </div>
              </div>
            )}

            {connectionState === "waiting" ? (
              <div className="flex-grow flex items-center justify-center flex-col gap-6 animate-in fade-in duration-500 px-4 text-center">
                <div className="w-20 h-20 relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-[#8d96f6]/20 rounded-full animate-ping" />
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="40"
                    height="40"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-[#8d96f6]"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-brightness mb-1">
                    Room is Full
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    You're in the waiting queue. You'll be admitted when a spot
                    opens.
                  </p>
                  {roomStatus && (
                    <p className="text-xs text-muted-foreground mt-2">
                      {roomStatus.activePeers}/{roomStatus.maxPeers} members
                      online
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    disconnectSignaling();
                    onLeaveRoom?.();
                  }}
                  className="text-sm text-red-400 hover:text-red-300 px-4 py-2 rounded-lg hover:bg-red-500/10 transition-colors border border-red-500/20"
                >
                  Leave Queue
                </button>
              </div>
            ) : connectionState === "searching" ? (
              <div className="flex-grow flex items-center justify-center flex-col gap-8 animate-in fade-in duration-500">
                <div className="w-24 h-24 relative flex items-center justify-center">
                  <svg
                    className="w-full h-full animate-logo-breathe"
                    viewBox="-2.4 -2.4 28.80 28.80"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fill="#8d96f6"
                      d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835 0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84.0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84.0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84.0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84.00 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z"
                    />
                  </svg>
                </div>
              </div>
            ) : connectionState === "idle" ? (
              <div className="flex-grow flex items-center justify-center flex-col gap-2">
                <p className="text-muted-foreground text-sm">
                  Click START to begin chatting
                </p>
              </div>
            ) : connectionState === "partner_skipped" ||
              connectionState === "self_skipped" ? (
              <div className="flex-grow overflow-y-auto chat-scrollbar">
                <PartnerSkippedView
                  onReport={() => {
                    setIsReportModalOpen(true);
                  }}
                  isSelfSkip={connectionState === "self_skipped"}
                />
              </div>
            ) : (
              <>
                <audio
                  ref={remoteAudioRef}
                  autoPlay
                  playsInline
                  style={{ display: "none" }}
                />

                {isTheaterMode ? (
                  <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-2 lg:gap-4 px-0 pb-0 sm:px-2 sm:pb-2 lg:px-4 lg:pb-4">
                    <div
                      className="relative w-full flex-none transition-all duration-300 lg:flex-1 lg:min-h-0"
                      style={
                        isMobile
                          ? {
                              maxHeight: isKeyboardVisible
                                ? "24dvh"
                                : hasDualTheaterStreams
                                  ? "40dvh"
                                  : "48dvh",
                            }
                          : undefined
                      }
                    >
                      <div
                        className={`flex h-full min-h-0 ${hasDualTheaterStreams ? "flex-col gap-2 lg:gap-4" : ""}`}
                      >
                        {theaterStreams.map((theaterStream) => (
                          <div
                            key={theaterStream.key}
                            className="flex-1 min-h-0 overflow-hidden"
                          >
                            <ScreenShareViewer
                              stream={theaterStream.stream}
                              label={theaterStream.label}
                              isLocal={theaterStream.isLocal}
                              onClose={() =>
                                theaterStream.isLocal
                                  ? useScreenShareStore.getState().requestStop()
                                  : useScreenShareStore.getState().clearRemoteSharing()
                              }
                              isMobile={isMobile}
                              pc={
                                theaterStream.isLocal
                                  ? null
                                  : getPeerConnection(
                                      useSessionStore.getState().partnerId ?? "",
                                    ) ?? null
                              }
                              layout="theater"
                              adaptiveBitrateEnabled={
                                theaterStream.isLocal
                                  ? adaptiveBitrateEnabled
                                  : undefined
                              }
                              onToggleAdaptiveBitrate={
                                theaterStream.isLocal
                                  ? () =>
                                      setAdaptiveBitrateEnabled(
                                        !adaptiveBitrateEnabled,
                                      )
                                  : undefined
                              }
                              adaptiveBitrateStats={
                                theaterStream.isLocal
                                  ? adaptiveBitrateStats
                                  : undefined
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 min-h-0 lg:flex-none lg:w-[360px] xl:w-[420px] bg-panel/70 rounded-2xl overflow-hidden shadow-[0_30px_120px_rgba(0,0,0,0.6)] backdrop-blur-xl">
                      <div className={`flex items-center justify-between px-4 ${isMobile && isKeyboardVisible ? "py-2" : "py-3"} bg-panel/80`}>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {partner?.name || "Chat"}
                            </span>
                            {partnerId && <ConnectionIndicator size="sm" />}
                            {partnerId && (
                              <span
                                className={`h-2.5 w-2.5 rounded-full ring-2 ${
                                  connectionState === "connected"
                                    ? "bg-emerald-400 ring-emerald-500/30"
                                    : connectionState === "searching" || connectionState === "waiting"
                                      ? "bg-amber-400 ring-amber-500/30"
                                      : "bg-slate-400 ring-slate-500/30"
                                }`}
                              />
                            )}
                          </div>
                          <span className="text-[11px] text-muted-foreground">
                            {isPartnerTyping ? "Typing…" : "Messages"}
                          </span>
                        </div>
                        <span className="text-[11px] text-emerald-400/90">
                          {isSignalReady && isCryptoReady
                            ? "Encrypted"
                            : "Connecting"}
                        </span>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden bg-panel/50">
                        <MessageList
                          messages={messages}
                          partnerName={partner?.name || "Partner"}
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
                          partnerName={partner?.name || "Stranger"}
                          onTyping={handleTyping}
                          onSelectFiles={handleSelectFiles}
                          isGifPickerOpen={isGifPickerOpen}
                          onToggleGifPicker={() =>
                            setIsGifPickerOpen((prev) => !prev)
                          }
                          onCloseGifPicker={() => setIsGifPickerOpen(false)}
                          isVanishMode={isVanishMode}
                          onToggleVanishMode={() =>
                            setIsVanishMode((prev) => !prev)
                          }
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
                        key={`remote-${remoteStreamVersion}`}
                        stream={remoteScreenStream}
                        label={partner?.name || "Partner"}
                        onClose={() =>
                          useScreenShareStore.getState().clearRemoteSharing()
                        }
                        isMobile={isMobile}
                        pc={
                          getPeerConnection(
                            useSessionStore.getState().partnerId ?? "",
                          ) ?? null
                        }
                      />
                    )}
                    {isLocalScreenSharing && localScreenStream && (
                      <ScreenShareViewer
                        stream={localScreenStream}
                        label="You"
                        isLocal
                        isMobile={isMobile}
                        adaptiveBitrateEnabled={adaptiveBitrateEnabled}
                        onToggleAdaptiveBitrate={() =>
                          setAdaptiveBitrateEnabled(!adaptiveBitrateEnabled)
                        }
                        adaptiveBitrateStats={adaptiveBitrateStats}
                        onClose={() =>
                          useScreenShareStore.getState().requestStop()
                        }
                      />
                    )}
                    <MessageList
                      messages={messages}
                      partnerName={partner?.name || "Partner"}
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
              partnerName={partner?.name || "Stranger"}
              onTyping={handleTyping}
              onSelectFiles={handleSelectFiles}
              isGifPickerOpen={isGifPickerOpen}
              onToggleGifPicker={() => setIsGifPickerOpen((prev) => !prev)}
              onCloseGifPicker={() => setIsGifPickerOpen(false)}
              isVanishMode={isVanishMode}
              onToggleVanishMode={() => setIsVanishMode((prev) => !prev)}
              isDirectConnectMode={isDirectConnectMode}
              isCompactGifPicker={false}
            />
          )}
        </div>

        {/* Desktop Peer List */}
        {isDirectConnectMode &&
          connectionState === "connected" &&
          isPeerListOpen && (
            <PeerListPanel
              peersInRoom={peersInRoom}
              onClose={() => setIsPeerListOpen(false)}
              isMobile={false}
            />
          )}

        {/* Mobile Peer List Overlay */}
        {isDirectConnectMode &&
          connectionState === "connected" &&
          isPeerListOpen && (
            <>
              <div
                className="fixed inset-0 bg-background/50 z-40 md:hidden animate-in fade-in"
                onClick={() => setIsPeerListOpen(false)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Escape" || event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setIsPeerListOpen(false);
                  }
                }}
              ></div>
              <PeerListPanel
                peersInRoom={peersInRoom}
                onClose={() => setIsPeerListOpen(false)}
                isMobile={true}
              />
            </>
          )}
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        message={messageToReport}
        onSubmit={async (reason) => {
          if (messageToReport?.senderId && peerId) {
            try {
              await reportUser(
                peerId,
                messageToReport.senderId,
                reason,
                `Reported message: \"${messageToReport.content.substring(0, 100)}\"...`
              );
            } catch (err) {
              console.error("[ChatArea] Failed to report user:", err);
            }
          }
        }}
      />

      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        peerId={selectedProfile?.peerId || undefined}
        username={selectedProfile?.username || ""}
        avatarSeed={selectedProfile?.avatarSeed || ""}
        avatarUrl={selectedProfile?.avatarUrl || null}
        isVerified={selectedProfile?.isVerified}
        interests={selectedProfile?.interests}
        interestsVisibility={selectedProfile?.interestsVisibility}
        badgeVisibility={selectedProfile?.badgeVisibility}
        joinedAt={selectedProfile?.joinedAt}
        onAddFriend={() =>
          handleAddFriend(selectedProfile?.peerId || partnerId || "")
        }
        onAcceptFriend={() =>
          handleAcceptFriendRequest(selectedProfile?.peerId || partnerId || "")
        }
        onDeclineFriend={() =>
          handleDeclineFriendRequest(selectedProfile?.peerId || partnerId || "")
        }
        requestStatus={
          selectedProfile?.peerId
            ? getFriendRequestStatus(selectedProfile.peerId)
            : partnerId
              ? getFriendRequestStatus(partnerId)
              : "none"
        }
      />
    </main>
  );
}
 
