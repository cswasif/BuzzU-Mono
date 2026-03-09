import { useState, useRef, useEffect, useCallback } from "react";
import { useSignalingContext, ChatMessage as SignalingChatMessage } from "../../context/SignalingContext";
import { useUserMedia } from "../hooks/use-user-media";
import { useSessionStore } from "../../stores/sessionStore";
import {
  FullscreenIcon,
  HistoryIcon,
  EarthIcon,
  GenderIcon,
  ChevronUpIcon,
  WavingHandIcon,
  SkipArrowIcon,
} from "./icons";

interface ChatMessage {
  id: string | number;
  text: string;
  sender: "me" | "them";
}

interface RemotePanelProps {
  onStartChat: () => void;
  onGenderClick: () => void;
  onWorldwideClick: () => void;
  isSearching?: boolean;
  isConnecting?: boolean;
  isMatched?: boolean;
  onSkip?: () => void;
  selectedInstitution: string;
}

export function RemotePanel({ onStartChat, onGenderClick, onWorldwideClick, isSearching, isConnecting, isMatched, onSkip, selectedInstitution }: RemotePanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);
  const { sendMessage, onMessage } = useSignalingContext();
  const { partnerId, displayName, avatarSeed, peerId } = useSessionStore();
  const { stream, permissionState } = useUserMedia();

  const institutionLabel = {
    all: "Anonymous",
    bracu: "Bracu University",
    non_bracu: "Non-Bracu",
  }[selectedInstitution] || "Anonymous";

  const handleVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node && stream) {
      node.srcObject = stream;
      node.play().catch(e => console.warn("Local preview play failed:", e));
    }
  }, [stream]);

  // Handle incoming messages
  useEffect(() => {
    const unsubscribe = onMessage('Chat', (msg) => {
      try {
        const payload = msg.payload || msg.message || '{}';
        const chatMsg: SignalingChatMessage = JSON.parse(payload);
        const isSelf = msg.from && msg.from === peerId;
        setMessages((prev) => [
          ...prev,
          {
            id: chatMsg.id,
            text: chatMsg.content,
            sender: isSelf ? "me" : "them",
          },
        ]);
      } catch (e) {
        console.error("Failed to parse chat message", e);
      }
    });

    return () => unsubscribe();
  }, [onMessage]);

  // Reset messages when match changes
  useEffect(() => {
    if (isMatched) {
      setMessages([]);
    }
  }, [isMatched]);


  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !partnerId) return;

    const chatMsg: SignalingChatMessage = {
      id: `local_${Date.now()}`,
      username: displayName,
      avatarSeed: avatarSeed,
      timestamp: new Date().toISOString(),
      content: inputValue.trim(),
    };

    sendMessage({
      type: 'Chat',
      from: peerId,
      to: partnerId,
      payload: JSON.stringify(chatMsg),
    });

    setMessages((prev) => [
      ...prev,
      {
        id: chatMsg.id,
        text: chatMsg.content,
        sender: "me",
      },
    ]);
    setInputValue("");
  };

  // Matched or Connecting state
  if (isMatched || isConnecting) {
    return (
      <div className="flex items-center justify-center w-full h-1/2 lg:w-1/2 lg:h-full bg-[hsl(var(--cc-panel))] rounded-sm lg:rounded-lg">
        <div className="relative w-full h-full bg-linear-to-tr from-black/80 via-black/25 to-[hsl(var(--cc-panel))] rounded-sm md:rounded-xl overflow-hidden">
          {/* Bottom gradient overlay */}
          <div className="absolute bottom-0 inset-x-0 z-20 md:rounded-xl bg-gradient-to-t from-black/55 via-black/30 to-transparent h-[50vh] md:h-[60vh] opacity-0 pointer-events-none" />

          {/* Chat section */}
          <section className="absolute px-1 md:px-4 bottom-3 md:bottom-5 z-30 w-full" aria-label="Chat container">
            {/* Messages area */}
            <div className="relative mb-1 md:mb-4 transition-opacity duration-500 hover:opacity-100 opacity-70">
              <div
                ref={chatRef}
                className="relative h-[30vh] md:h-[40vh] overflow-y-auto p-1 md:p-1.5"
                style={{ scrollbarWidth: "none" }}
              >
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mb-1.5 flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm ${msg.sender === "me"
                        ? "bg-violet-600/80 text-white"
                        : "bg-white/15 text-white"
                        }`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Message input */}
            <form className="relative flex items-center" onSubmit={handleSend}>
              <div className="absolute inset-0 bg-black/25 backdrop-blur-sm rounded-full" />
              <input
                placeholder="Send a message..."
                className="w-full bg-transparent relative py-3 md:py-4 pl-3 md:pl-4 rounded-full text-white placeholder:text-white/65 focus:outline-hidden text-sm pr-16"
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
              />
              <button
                type="submit"
                disabled={!inputValue.trim()}
                className="absolute right-2 px-3 py-1.5 text-sm font-semibold text-white/90 disabled:text-white/40 disabled:cursor-not-allowed cursor-pointer"
              >
                Send
              </button>
            </form>
          </section>

          {/* Fullscreen button */}
          <div className="bg-black/30 rounded-full p-0 flex items-center justify-center absolute z-50 top-3.5 left-3.5 lg:left-4">
            <button className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden hover:text-accent-foreground px-3 rounded-full text-white/95 hover:bg-black/60 size-9">
              <FullscreenIcon />
            </button>
          </div>

          {/* History button - mobile only, collapsed */}
          <button className="inline-flex cursor-pointer items-center justify-center text-sm ring-offset-background focus-visible:outline-hidden h-9 px-3 rounded-full md:rounded-3xl text-white font-bold gap-1.5 bg-black/30 hover:bg-black/40 absolute z-30 top-3.5 left-14 lg:hidden">
            <HistoryIcon />
            <span className="overflow-hidden transition-all duration-300 max-w-0 ml-0 opacity-0 hidden">
              History
            </span>
          </button>

          {/* Skip button - mobile only */}
          <button
            onClick={onSkip}
            disabled={isConnecting}
            className={`inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden rounded-full p-0 opacity-90 bg-neutral-900/75 hover:bg-neutral-900/95 transition-all duration-500 ${isConnecting ? "size-[50px]" : "w-[90px] h-[50px]"} mb-2 lg:hidden absolute z-30 top-2 right-3 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className={`flex items-center ${isConnecting ? "justify-center" : "justify-start"} w-full px-4`}>
              <SkipArrowIcon />
              {!isConnecting && <span className="text-white ml-2">Skip</span>}
            </div>
          </button>

          {/* Video element */}
          <div className="relative w-full h-full">
            <video
              ref={handleVideoRef}
              autoPlay
              playsInline
              muted
              disablePictureInPicture
              className={`absolute z-10 top-0 left-0 w-full h-full object-cover scale-x-[-1] transform-gpu will-change-transform transition-all duration-300 ease-in-out ${!stream ? 'opacity-0' : 'opacity-100'}`}
            />
          </div>
        </div>
      </div>
    );
  }

  // Idle / Searching state
  return (
    <div className="flex items-center justify-center w-full h-1/2 lg:w-1/2 lg:h-full bg-[hsl(var(--cc-panel))] rounded-sm lg:rounded-lg">
      <div className="relative w-full h-full bg-linear-to-tr from-black/80 via-black/25 to-[hsl(var(--cc-panel))] rounded-sm md:rounded-xl overflow-hidden">
        {/* Desktop filter bar - hidden when searching */}
        {!isSearching && (
          <div className="absolute bottom-20 z-30 w-full max-lg:hidden">
            <div className="flex flex-row justify-around w-full px-4 space-x-4 bottom-4">
              <div className="flex max-w-[350px] w-full h-16 bg-black/50 border items-center justify-center border-purple-400/60 rounded-full backdrop-blur-xl">
                {/* Worldwide button */}
                <button onClick={onWorldwideClick} className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-accent-foreground rounded-md flex-1 h-full gap-2 hover:bg-black/10 lg:rounded-r-none rounded-l-3xl rounded-r-3xl w-full border-none px-2.5 bg-transparent text-white">
                  <EarthIcon />
                  <span className="truncate max-w-[120px]">{institutionLabel}</span>
                  <ChevronUpIcon />
                </button>

                {/* Divider */}
                <div
                  data-orientation="vertical"
                  role="none"
                  className="h-full shrink-0 w-px bg-white/20"
                />

                {/* Gender button */}
                <button onClick={onGenderClick} className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-accent-foreground rounded-md flex-1 h-full gap-2 hover:bg-black/10 lg:rounded-l-none rounded-l-3xl rounded-r-3xl w-full border-none bg-transparent px-2.5 text-white">
                  <GenderIcon />
                  Gender
                  <ChevronUpIcon />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Fullscreen button */}
        <div className="bg-black/30 rounded-full p-0 flex items-center justify-center absolute z-50 top-3.5 left-3.5 lg:left-4">
          <button className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-accent-foreground px-3 rounded-full text-white/95 hover:bg-black/60 size-9">
            <FullscreenIcon />
          </button>
        </div>

        {/* History button - mobile only */}
        <button className="inline-flex cursor-pointer items-center justify-center text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 px-3 rounded-full md:rounded-3xl text-white font-bold gap-1.5 bg-black/30 hover:bg-black/40 absolute z-30 top-3.5 left-14 lg:hidden">
          <HistoryIcon />
          <span className={`overflow-hidden transition-all duration-300 ${isSearching ? "max-w-0 ml-0 opacity-0 hidden" : "max-w-[100px] opacity-100 !block"}`}>
            History
          </span>
        </button>

        {/* Video placeholder area */}
        <div className="relative w-full h-full bg-[#121215]">
          {/* Waiting for camera / Denied state UI */}
          {!stream && (
            <div className="flex flex-col items-center justify-center w-full h-full absolute z-20">
              {permissionState === 'prompt' && (
                <>
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-orange-500 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 md:w-10 md:h-10 text-white animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48 2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48 2.83-2.83" />
                    </svg>
                  </div>
                  <h2 className="text-lg md:text-2xl font-bold text-white mb-2 tracking-wide text-center">Random Video Match</h2>
                  <p className="text-white/70 text-sm md:text-base text-center max-w-sm px-4">Click "Start Video Chat" to meet someone new!</p>
                </>
              )}
              {permissionState === 'denied' && (
                <>
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-red-500 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 md:w-10 md:h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <h2 className="text-lg md:text-2xl font-bold text-white mb-2 tracking-wide text-center">Camera Blocked</h2>
                  <p className="text-white/70 text-sm md:text-base text-center max-w-sm px-4">Please enable camera access in your browser settings to use Video Chat.</p>
                </>
              )}
            </div>
          )}

          <video
            ref={handleVideoRef}
            autoPlay
            playsInline
            muted
            className={`absolute z-10 top-0 left-0 w-full h-full object-cover scale-x-[-1] transition-all duration-300 ease-in-out ${!stream ? 'opacity-0' : 'opacity-100'}`}
          />
        </div>

        {/* Mobile controls overlay - hidden when searching */}
        {!isSearching && (
          <div className="lg:hidden bg-transparent z-20 absolute inset-0 flex flex-col">
            <div className="flex flex-col justify-end h-full absolute bottom-2 items-center w-full space-y-4 max-w-md mx-auto inset-x-0">
              {/* Mobile filter buttons */}
              <div className="flex flex-row justify-around w-full px-4 max-lg:h-12 gap-2">
                <button onClick={onWorldwideClick} className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-accent-foreground rounded-md flex-1 h-full bg-transparent gap-2 hover:bg-black/10 lg:rounded-r-none rounded-l-3xl rounded-r-3xl w-full !bg-black/55 border-none px-2.5 text-white">
                  <EarthIcon />
                  <span className="truncate max-w-[100px]">{institutionLabel}</span>
                  <ChevronUpIcon />
                </button>
                <button onClick={onGenderClick} className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:text-accent-foreground rounded-md flex-1 h-full gap-2 hover:bg-black/10 lg:rounded-l-none rounded-l-3xl rounded-r-3xl w-full !bg-black/55 border-none px-2.5 text-white">
                  <GenderIcon />
                  Gender
                  <ChevronUpIcon />
                </button>
              </div>

              {/* Mobile Start Video Chat button */}
              <button
                onClick={onStartChat}
                className="inline-flex cursor-pointer items-center justify-center ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-14 px-10 font-semibold sm:flex-none min-h-[55px] gap-2 !rounded-full group/start-btn max-md:px-8 bg-violet-700 hover:bg-violet-800 md:px-16 md:h-16 text-lg normal-case w-[90%] mb-2 rounded-xl text-white"
              >
                <span className="group-hover/start-btn:cc-animate-wave">
                  <WavingHandIcon />
                </span>
                Start Video Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
