import { useState, useEffect, useCallback, useRef } from "react";
import "./video-match.css";
import { HeaderNav } from "./components/header-nav";
import { LocalPanel } from "./components/local-panel";
import { RemotePanel } from "./components/remote-panel";
import { EditProfileModal } from "./components/edit-profile-modal";
import { GenderPreferencesModal } from "./components/gender-preferences-modal";
import { RegionPreferencesModal } from "./components/region-preferences-modal";
import { ReportUserModal } from "./components/report-user-modal";
import { MoreModal } from "./components/more-modal";
import { useMatching } from "../hooks/useMatching";
import { useSignaling } from "../hooks/useSignaling";
import { useWebRTC } from "../hooks/useWebRTC";
import { useSessionStore } from "../stores/sessionStore";
import { reportUser } from "../utils/reputationUtils";
import { REPORT_REASONS } from "./components/report-user-modal";
import { useUserMedia } from "./hooks/use-user-media";
import { UserMediaProvider } from "../context/UserMediaContext";
import { useConnectionResilience } from "../hooks/useConnectionResilience";

type AppViewerState = "idle" | "searching" | "connecting" | "matched";

function VideoMatchContent({ onBack }: { onBack?: () => void }) {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [moreModalOpen, setMoreModalOpen] = useState(false);

  const { peerId, isBracuUser, setIsBracuUser, selectedInstitution, setSelectedInstitution, currentRoomId, partnerId, leaveRoom, setChatMode } = useSessionStore();

  // Lock this session to video mode so the matchmaker only pairs us with other
  // video-mode users. Reset to 'text' on unmount to avoid polluting text chat.
  useEffect(() => {
    setChatMode('video');
    return () => setChatMode('text');
  }, [setChatMode]);


  const { isMatching, startMatching, stopMatching, matchData, setMatchData, error: matchingError } = useMatching();
  const { onPeerLeave, onPeerSkip, onPeerJoin, sendSkip, connect, disconnect, isConnected: signalingConnected } = useSignaling();
  const {
    initiateCall,
    setLocalStream,
    closeAllPeerConnections,
    getPeerConnections,
    applyTurnFallback,
    isFallbackActive,
    getConnectionState,
  } = useWebRTC();
  const { stream: localMediaStream } = useUserMedia();

  const [viewerState, setViewerState] = useState<AppViewerState>("idle");
  const partnerLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selfSkipFinalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLeavePeerRef = useRef<string | null>(null);
  const partnerSkipIntentRef = useRef<Set<string>>(new Set());
  const partnerSkipHandledRef = useRef(false);
  const initiatedOfferKeyRef = useRef<string | null>(null);
  const offerInitInFlightRef = useRef<Set<string>>(new Set());
  const waitingOfferKeyRef = useRef<string | null>(null);
  const isInChat = viewerState === "matched" || viewerState === "connecting";

  useConnectionResilience({
    getPeerConnections,
    applyTurnFallback,
    isFallbackActive,
    getConnectionState,
    isInChat,
  });

  const handlePartnerSkip = useCallback(() => {
    if (partnerSkipHandledRef.current) return;
    partnerSkipHandledRef.current = true;
    initiatedOfferKeyRef.current = null;
    waitingOfferKeyRef.current = null;
    offerInitInFlightRef.current.clear();
    disconnect();
    closeAllPeerConnections();
    setMatchData(null);
    setViewerState("idle");
    leaveRoom();
    setTimeout(() => {
      startMatching(true);
    }, 200);
  }, [startMatching, closeAllPeerConnections, disconnect, leaveRoom, setMatchData]);

  const handleSkip = useCallback(() => {
    const shouldDelayDisconnect = Boolean(partnerId && signalingConnected);
    if (partnerId && signalingConnected) {
      sendSkip(partnerId, "skip");
    }
    if (selfSkipFinalizeTimerRef.current) {
      clearTimeout(selfSkipFinalizeTimerRef.current);
      selfSkipFinalizeTimerRef.current = null;
    }
    if (shouldDelayDisconnect) {
      setViewerState("idle");
      selfSkipFinalizeTimerRef.current = setTimeout(() => {
        selfSkipFinalizeTimerRef.current = null;
        handlePartnerSkip();
      }, 140);
      return;
    }
    handlePartnerSkip();
  }, [partnerId, signalingConnected, sendSkip, handlePartnerSkip]);

  const handleEndChat = () => {
    initiatedOfferKeyRef.current = null;
    waitingOfferKeyRef.current = null;
    offerInitInFlightRef.current.clear();
    stopMatching(true);
    closeAllPeerConnections();
    leaveRoom();
    setViewerState("idle");
    if (onBack) onBack();
  };

  // Sync local stream with WebRTC
  useEffect(() => {
    if (localMediaStream) {
      setLocalStream(localMediaStream);
    }
  }, [localMediaStream, setLocalStream]);

  // Signaling connection management
  useEffect(() => {
    if (matchData && peerId) {
      console.log("[VideoMatchPage] Connecting to signaling room:", matchData.room_id);
      connect(matchData.room_id, peerId);
    } else if (!isMatching) {
      console.log("[VideoMatchPage] Disconnecting from signaling (no active match)");
      disconnect();
    }
  }, [matchData, peerId, isMatching, connect, disconnect]);

  // Handle incoming match - initiate call if we are the offerer
  useEffect(() => {
    if (matchData && peerId && localMediaStream && signalingConnected) {
      const sessionKey = `${matchData.room_id}:${matchData.partner_id}:${peerId}`;
      // Simple logic: lexicographically smaller peer_id is the offerer
      const isOfferer = peerId < matchData.partner_id;
      if (isOfferer) {
        waitingOfferKeyRef.current = null;
        if (
          initiatedOfferKeyRef.current === sessionKey ||
          offerInitInFlightRef.current.has(sessionKey)
        ) {
          return;
        }
        const connectionState = getConnectionState(matchData.partner_id);
        if (connectionState.type === "connected" || connectionState.type === "connecting") {
          initiatedOfferKeyRef.current = sessionKey;
          return;
        }
        offerInitInFlightRef.current.add(sessionKey);
        console.log("[VideoMatchPage] We are the offerer, initiating call to:", matchData.partner_id);
        initiateCall(matchData.partner_id, localMediaStream)
          .then(() => {
            initiatedOfferKeyRef.current = sessionKey;
          })
          .catch(() => {
            if (initiatedOfferKeyRef.current === sessionKey) {
              initiatedOfferKeyRef.current = null;
            }
          })
          .finally(() => {
            offerInitInFlightRef.current.delete(sessionKey);
          });
      } else {
        if (waitingOfferKeyRef.current === sessionKey) {
          return;
        }
        waitingOfferKeyRef.current = sessionKey;
        console.log("[VideoMatchPage] We are the answerer, waiting for offer from:", matchData.partner_id);
      }
    }
  }, [matchData, peerId, localMediaStream, initiateCall, signalingConnected, getConnectionState]);

  useEffect(() => {
    if (!matchData) {
      initiatedOfferKeyRef.current = null;
      waitingOfferKeyRef.current = null;
      offerInitInFlightRef.current.clear();
    }
  }, [matchData]);

  // Transition to matched state when room/partner assigned in store
  useEffect(() => {
    if (isMatching) {
      setViewerState("searching");
    } else if (currentRoomId && partnerId) {
      setViewerState("matched");
    } else if (matchData) {
      setViewerState("connecting");
    } else {
      setViewerState("idle");
    }
  }, [isMatching, currentRoomId, partnerId, matchData]);

  // Handle partner leaving
  useEffect(() => {
    partnerSkipHandledRef.current = false;
    if (partnerId) {
      partnerSkipIntentRef.current.delete(partnerId);
    }

    onPeerSkip((from) => {
      if (from === partnerId) {
        partnerSkipIntentRef.current.add(from);
        handlePartnerSkip();
      }
    });

    onPeerLeave((leftPeerId: string) => {
      if (leftPeerId === partnerId) {
        if (partnerSkipIntentRef.current.has(leftPeerId)) {
          handlePartnerSkip();
          return;
        }
        pendingLeavePeerRef.current = leftPeerId;
        if (partnerLeaveTimerRef.current) {
          clearTimeout(partnerLeaveTimerRef.current);
        }
        partnerLeaveTimerRef.current = setTimeout(() => {
          if (pendingLeavePeerRef.current !== leftPeerId) return;
          handlePartnerSkip();
        }, 1200);
      }
    });

    onPeerJoin((joinedPeerId) => {
      if (joinedPeerId !== partnerId) return;
      if (pendingLeavePeerRef.current === joinedPeerId) {
        pendingLeavePeerRef.current = null;
        if (partnerLeaveTimerRef.current) {
          clearTimeout(partnerLeaveTimerRef.current);
          partnerLeaveTimerRef.current = null;
        }
      }
      partnerSkipIntentRef.current.delete(joinedPeerId);
      partnerSkipHandledRef.current = false;
    });

    return () => {
      onPeerLeave(null);
      onPeerSkip(null);
      onPeerJoin(null);
    };
  }, [onPeerLeave, onPeerSkip, onPeerJoin, partnerId, handlePartnerSkip]);

  const handleComplete = () => {
    setProfileModalOpen(false);
    startMatching(true);
  };

  const handleStartChat = () => {
    const genderChoice = useSessionStore.getState().gender;
    if (genderChoice && genderChoice !== 'U') {
      startMatching(true);
    } else {
      setProfileModalOpen(true);
    }
  };

  return (
    <main className="dark text-[hsl(var(--cc-foreground))] bg-[hsl(var(--cc-background))] h-[100dvh] w-full overflow-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-[hsl(var(--cc-foreground))] bg-[hsl(var(--cc-background))] h-[100dvh]" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="flex h-[100dvh] flex-col select-none fixed top-0 left-0 w-full pb-[env(safe-area-inset-bottom)]">
          <div className="relative h-full flex grow flex-1 overflow-hidden">
            <div className="h-full w-full flex flex-row items-center bg-[hsl(var(--cc-card))] relative">
              {matchingError && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1rem)] max-w-xl rounded-xl border border-red-500/40 bg-red-500/15 backdrop-blur-md px-3 py-2 text-sm text-red-100 flex items-center justify-between gap-3">
                  <span className="truncate">Matching issue: {matchingError}</span>
                  <button
                    onClick={() => startMatching(true)}
                    className="rounded-lg bg-red-500/30 hover:bg-red-500/40 px-2.5 py-1 text-xs font-semibold whitespace-nowrap"
                  >
                    Retry
                  </button>
                </div>
              )}
              {/* Header Navigation */}
              <HeaderNav
                isSearching={viewerState === "searching"}
                isMatched={viewerState === "matched" || viewerState === "connecting"}
                onEndChat={handleEndChat}
                onMore={() => setMoreModalOpen(true)}
              />

              {/* Main content area */}
              <div className="w-full h-full flex flex-col items-center justify-center">
                <div className="flex flex-row w-full h-full">
                  <div data-lk-theme="dark" className="h-full flex w-full relative">
                    <div className="w-full h-full flex p-0.5 lg:p-1.5 gap-1 lg:gap-1.5 shrink items-center justify-center flex-col lg:flex-row">
                      {/* Local video panel (left) */}
                      <LocalPanel
                        onStartChat={handleStartChat}
                        isSearching={viewerState === "searching"}
                        isConnecting={viewerState === "connecting"}
                        isMatched={viewerState === "matched"}
                        onSkip={handleSkip}
                        onReport={() => setReportModalOpen(true)}
                      />

                      {/* Remote video panel (right) */}
                      <RemotePanel
                        onStartChat={handleStartChat}
                        onGenderClick={() => setGenderModalOpen(true)}
                        onWorldwideClick={() => setRegionModalOpen(true)}
                        isSearching={viewerState === "searching"}
                        isConnecting={viewerState === "connecting"}
                        isMatched={viewerState === "matched"}
                        onSkip={handleSkip}
                        selectedInstitution={selectedInstitution}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        onComplete={handleComplete}
        isBracuUser={isBracuUser}
        onToggleBracu={setIsBracuUser}
      />
      <GenderPreferencesModal
        open={genderModalOpen}
        onClose={() => setGenderModalOpen(false)}
      />
      <RegionPreferencesModal
        open={regionModalOpen}
        onClose={() => setRegionModalOpen(false)}
        isBracuUser={isBracuUser}
        selected={selectedInstitution}
        onSelect={setSelectedInstitution}
      />
      <ReportUserModal
        open={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        onSubmit={async (reasonId) => {
          if (peerId && partnerId) {
            const reasonLabel = REPORT_REASONS.find(r => r.id === reasonId)?.label || reasonId;
            console.log(`[BuzzU] Reporting partner ${partnerId} for: ${reasonLabel}`);
            await reportUser(peerId, partnerId, reasonLabel, `Reported from video match with reason ID: ${reasonId}`);
          }
          setReportModalOpen(false);
          handleSkip();
        }}
      />
      <MoreModal
        open={moreModalOpen}
        onClose={() => setMoreModalOpen(false)}
      />
    </main>
  );
}

export default function App(props: { onBack?: () => void }) {
  return (
    <UserMediaProvider>
      <VideoMatchContent {...props} />
    </UserMediaProvider>
  );
}
