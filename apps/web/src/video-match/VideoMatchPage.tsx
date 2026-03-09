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
import { useUserMedia } from "./hooks/use-user-media";
import { UserMediaProvider } from "../context/UserMediaContext";

type AppViewerState = "idle" | "searching" | "connecting" | "matched";

function VideoMatchContent({ onBack }: { onBack?: () => void }) {
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [genderModalOpen, setGenderModalOpen] = useState(false);
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [moreModalOpen, setMoreModalOpen] = useState(false);

  const { peerId, isBracuUser, setIsBracuUser, selectedInstitution, setSelectedInstitution, currentRoomId, partnerId, leaveRoom } = useSessionStore();

  const { isMatching, startMatching, stopMatching, matchData, setMatchData, error: matchingError } = useMatching();
  const { onPeerLeave, connect, disconnect, isConnected: signalingConnected } = useSignaling();
  const { initiateCall, setLocalStream, closeAllPeerConnections } = useWebRTC();
  const { stream: localMediaStream } = useUserMedia();

  const [viewerState, setViewerState] = useState<AppViewerState>("idle");

  const handleSkip = useCallback(() => {
    disconnect();
    closeAllPeerConnections();
    setMatchData(null);
    setViewerState("idle");
    leaveRoom();
    setTimeout(() => {
      startMatching();
    }, 200);
  }, [startMatching, closeAllPeerConnections, disconnect, leaveRoom]);

  const handleEndChat = () => {
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
      // Simple logic: lexicographically smaller peer_id is the offerer
      const isOfferer = peerId < matchData.partner_id;
      if (isOfferer) {
        console.log("[VideoMatchPage] We are the offerer, initiating call to:", matchData.partner_id);
        initiateCall(matchData.partner_id, localMediaStream);
      } else {
        console.log("[VideoMatchPage] We are the answerer, waiting for offer from:", matchData.partner_id);
      }
    }
  }, [matchData, peerId, localMediaStream, initiateCall, signalingConnected]);

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
    onPeerLeave((leftPeerId: string) => {
      if (leftPeerId === partnerId) {
        console.log("[VideoMatchPage] Partner left:", leftPeerId);
        // Automatically skip to find a new partner
        handleSkip();
      }
    });
    return () => onPeerLeave(null);
  }, [onPeerLeave, partnerId, handleSkip]);

  const handleComplete = () => {
    setProfileModalOpen(false);
    startMatching();
  };

  const handleStartChat = () => {
    setProfileModalOpen(true);
  };

  return (
    <main className="dark text-[hsl(var(--cc-foreground))] bg-[hsl(var(--cc-background))] h-full w-full" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <div className="text-[hsl(var(--cc-foreground))] bg-[hsl(var(--cc-background))] h-full" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="flex h-full flex-col select-none fixed top-0 left-0 w-full">
          <div className="relative h-full flex grow flex-1 overflow-hidden">
            <div className="h-full w-full flex flex-row items-center bg-[hsl(var(--cc-card))] relative">
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
        onSubmit={(reasonId) => {
          console.log("Reported with reason:", reasonId);
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
