import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { AnimatedBackground } from "./animated-background";
import { RedditIcon, XIcon, WavingHandIcon, ReportFlagIcon, SkipArrowIcon } from "./icons";
import buzzuLogo from "figma:asset/buzzu.svg";
import { useSignalingContext } from "../../context/SignalingContext";
import { useMatching } from "../../hooks/useMatching";
import { ShieldCheck } from "lucide-react";
import { useSessionStore } from "../../stores/sessionStore";
import { useLobbyProbe } from "../../hooks/useLobbyProbe";
import { Wifi, WifiOff, AlertTriangle } from "lucide-react";

const ICEBREAKERS = [
  "Your mood as a color? 🎨",
  "Dream trip packing? 🧳",
  "Favorite midnight snack? 🌙",
  "If you could teleport anywhere? ✈️",
  "Best song right now? 🎵",
  "Coffee or tea? ☕",
];

const GREETINGS = [
  "Smile first 🙂",
  "Be friendly, have fun 💬",
  "Say hi! 👋",
  "Keep it cool 😎",
];

const STRANGER_DATA = [
  { name: "Stranger", age: 28, country: "India", flag: "in" },
  { name: "Stranger", age: 22, country: "Brazil", flag: "br" },
  { name: "Stranger", age: 26, country: "Indonesia", flag: "id" },
  { name: "Stranger", age: 24, country: "Turkey", flag: "tr" },
  { name: "Stranger", age: 30, country: "Germany", flag: "de" },
];

interface LocalPanelProps {
  onStartChat: () => void;
  isSearching?: boolean;
  isConnecting?: boolean;
  isMatched?: boolean;
  onSkip?: () => void;
  onReport?: () => void;
}

export function LocalPanel({ onStartChat, isSearching, isConnecting, isMatched, onSkip, onReport }: LocalPanelProps) {
  const { remoteStream } = useSignalingContext();
  const { videoActiveUsers } = useMatching();
  const { partnerIsVerified } = useSessionStore();
  const { quality, rtt, isUdpBlocked, warnings, isProbing } = useLobbyProbe();
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Remote audio mute toggle
  const [isMuted, setIsMuted] = useState(false);

  // Sync remoteStream to video and audio elements whenever either changes
  useEffect(() => {
    const videoNode = videoRef.current;
    const audioNode = audioRef.current;

    if (remoteStream) {
      if (videoNode) {
        videoNode.srcObject = remoteStream;
        videoNode.disableRemotePlayback = true;
        videoNode.preload = 'none';
        videoNode.playbackRate = 1.0;
        videoNode.defaultPlaybackRate = 1.0;
        videoNode.muted = true; // Mute the video specifically to let the audio tag handle sound
        videoNode.play().catch(e => console.warn("Remote video play failed:", e));
      }
      if (audioNode) {
        if (audioNode.srcObject !== remoteStream) {
          audioNode.srcObject = remoteStream;
        }
        audioNode.muted = isMuted;
        audioNode.play().catch(e => console.warn("Remote audio play failed:", e));
      }
    } else {
      if (videoNode) videoNode.srcObject = null;
      if (audioNode) audioNode.srcObject = null;
    }
  }, [remoteStream, isMuted]);



  const toggleMute = useCallback(() => {
    setIsMuted(prev => {
      const newMuted = !prev;
      if (videoRef.current) {
        videoRef.current.muted = true; // Video always muted to avoid double audio
      }
      if (audioRef.current) {
        audioRef.current.muted = newMuted;
      }
      return newMuted;
    });
  }, []);

  // Pick random stranger & icebreaker once per connecting session
  const stranger = useMemo(
    () => STRANGER_DATA[Math.floor(Math.random() * STRANGER_DATA.length)],
    [isConnecting]
  );
  const greeting = useMemo(
    () => GREETINGS[Math.floor(Math.random() * GREETINGS.length)],
    [isConnecting]
  );
  const icebreaker = useMemo(
    () => ICEBREAKERS[Math.floor(Math.random() * ICEBREAKERS.length)],
    [isConnecting]
  );

  // Connecting state: show stranger info overlay with blurred background
  if (isConnecting) {
    return (
      <div className="flex items-center justify-center w-full h-1/2 lg:w-1/2 lg:h-full bg-[hsl(var(--cc-panel))] rounded-sm lg:rounded-lg">
        <div className="relative w-full h-full group overflow-hidden">
          {/* Report & Skip buttons (top-right) - collapsed circles */}
          <div className="absolute z-40 items-center px-3.5 py-2.5 lg:px-5 lg:py-4 top-0 right-0">
            <div className="flex flex-col items-center justify-center md:items-end">
              {/* Report button - collapsed circle */}
              <button aria-label="Report user" onClick={onReport} className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden rounded-full size-[50px] p-0 opacity-90 bg-red-600/95 hover:bg-red-600 group/report transition-all duration-500 relative z-40 mb-5 text-white">
                <div className="flex items-center justify-center w-full">
                  <ReportFlagIcon />
                </div>
              </button>

              {/* Skip button - collapsed circle, disabled */}
              <button
                disabled
                aria-label="Skip unavailable while connecting"
                className="inline-flex cursor-not-allowed items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden rounded-full p-0 opacity-90 bg-neutral-900/75 size-[50px] transition-all duration-500 relative max-lg:hidden disabled:opacity-50"
              >
                <div className="flex items-center justify-center w-full">
                  <SkipArrowIcon />
                </div>
              </button>
            </div>
          </div>

          {/* Background: blurred gradient canvas effect */}
          <div className="w-full h-full relative rounded-xl overflow-hidden">
            {/* Simulated blurred canvas background */}
            <div
              className="rounded-xl absolute inset-0 w-full h-full bg-cover bg-center"
              style={{
                backgroundImage: "url(/assets/partner_fallback.jpg)",
                filter: "blur(30px)",
                transform: "scale(1.1)",
              }}
            />

            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black opacity-70" />

            {/* Stranger info overlay */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 z-20">
              <div className="text-white text-2xl md:text-4xl font-bold mb-6 text-center">
                {greeting}
              </div>

              {/* Stranger card */}
              <div className="flex items-center justify-center flex-row bg-black/25 rounded-full py-2 px-4 backdrop-blur-md">
                <img
                  alt="avatar"
                  loading="lazy"
                  className="w-16 h-16 rounded-full mr-2"
                  src="https://proxy.extractcss.dev/https://video.chitchat.gg/images/avatar-placeholder.svg"
                />
                <div className="flex flex-col text-white">
                  <span className="text-lg font-semibold">
                    {stranger.name}, {stranger.age}
                  </span>
                  <span className="flex items-center mt-1">
                    <img
                      data-testid="circle-country-flag"
                      height="22"
                      width="22"
                      className="mr-1.5"
                      title={stranger.flag}
                      src={`https://react-circle-flags.pages.dev/${stranger.flag}.svg`}
                    />
                    <span className="text-base">{stranger.country}</span>
                  </span>
                </div>
              </div>

              {/* Icebreaker */}
              <span className="text-white mt-5 opacity-90 tracking-wide whitespace-nowrap overflow-hidden text-ellipsis max-w-full">
                {icebreaker}
              </span>
            </div>
          </div>

          {/* Video element (behind overlay) */}
          <div
            className="absolute inset-0 w-full h-full bg-cover bg-center"
            style={{ backgroundImage: 'url(/assets/partner_fallback.jpg)' }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              disablePictureInPicture
              className={`absolute inset-0 w-full h-full object-cover rounded-sm md:rounded-xl bg-transparent transform-gpu will-change-transform transition-opacity duration-300 ${remoteStream ? "opacity-100" : "opacity-0"}`}
            />
            <audio ref={audioRef} className="hidden" playsInline autoPlay />
          </div>
        </div>
      </div>
    );
  }

  // Matched state: show video with Report/Skip buttons, country flag, and brand watermark
  if (isMatched) {
    return (
      <div className="flex items-center justify-center w-full h-1/2 lg:w-1/2 lg:h-full bg-[hsl(var(--cc-panel))] rounded-sm lg:rounded-lg">
        <div className="relative w-full h-full group overflow-hidden">
          {/* Report & Skip buttons (top-right) */}
          <div className="absolute z-40 items-center px-3.5 py-2.5 lg:px-5 lg:py-4 top-0 right-0">
            <div className="flex flex-col items-center justify-center md:items-end">
              {/* Report button */}
              <button aria-label="Report user" onClick={onReport} className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden rounded-full p-0 opacity-90 bg-red-600/95 hover:bg-red-600 group/report transition-all duration-500 w-[100px] h-[50px] relative z-40 mb-5 text-white">
                <div className="flex items-center justify-start w-full px-4">
                  <ReportFlagIcon />
                  <span className="text-white ml-2">Report</span>
                </div>
              </button>

              {/* Skip button - desktop only */}
              <button
                onClick={onSkip}
                aria-label="Skip to next match"
                className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden rounded-full p-0 opacity-90 bg-neutral-900/75 hover:bg-neutral-900/95 transition-all duration-500 w-[90px] h-[50px] relative max-lg:hidden"
              >
                <div className="flex items-center justify-start w-full px-4">
                  <SkipArrowIcon />
                  <span className="text-white ml-2">Skip</span>
                </div>
              </button>
            </div>
          </div>

          {/* Top-left verification badge */}
          <div className="absolute top-3 left-0 right-0 max-lg:w-1/2 max-lg:z-30 z-10">
            <div className="flex flex-row w-full justify-between px-1.5 sm:px-3 items-center">
              {partnerIsVerified ? (
                <div className="flex flex-row gap-1.5 bg-blue-500/20 border border-blue-500/30 py-1.5 px-2 sm:py-2 rounded-lg text-blue-500 items-center justify-center backdrop-blur-md">
                  <ShieldCheck className="size-4 fill-blue-500/10" />
                  <span className="text-blue-500 font-semibold text-xs tracking-wide">
                    Verified BracU
                  </span>
                </div>
              ) : (
                <div className="flex flex-row gap-1.5 bg-black/40 border border-white/5 py-1.5 px-2 sm:py-2 rounded-lg text-white items-center justify-center backdrop-blur-md">
                  <span className="text-white/80 font-semibold text-xs tracking-wide">
                    Anonymous
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Brand watermark (bottom) */}
          <div className="absolute w-full bottom-0.5 sm:bottom-2.5 z-20">
            <div className="flex flex-row w-full justify-between px-1.5 sm:px-3 items-center">
              {/* Audio mute toggle */}
              <button
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute remote audio" : "Mute remote audio"}
                className="flex items-center justify-center size-9 rounded-full bg-black/30 hover:bg-black/50 transition-colors text-white"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
                    <line x1="22" x2="16" y1="9" y2="15" />
                    <line x1="16" x2="22" y1="9" y2="15" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
              <div className="opacity-75">
                <img
                  className="sm:w-28 w-20"
                  alt="BuzzU"
                  src={buzzuLogo}
                />
              </div>
            </div>
          </div>

          {/* Video element */}
          <div
            className="relative w-full h-full bg-cover bg-center"
            style={{ backgroundImage: 'url(/assets/partner_fallback.jpg)' }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              disablePictureInPicture
              className={`absolute inset-0 w-full h-full object-cover rounded-sm md:rounded-xl bg-transparent transform-gpu will-change-transform transition-opacity duration-300 ${remoteStream ? "opacity-100" : "opacity-0"}`}
            />
            <audio ref={audioRef} className="hidden" playsInline autoPlay />
          </div>
        </div>
      </div>
    );
  }

  // Idle / Searching state
  return (
    <div className="flex items-center justify-center w-full h-1/2 lg:w-1/2 lg:h-full bg-[hsl(var(--cc-panel))] rounded-sm lg:rounded-lg">
      <div className="relative w-full h-full group overflow-hidden">
        <div
          className="w-full h-full relative bg-black rounded-sm md:rounded-xl overflow-hidden bg-cover bg-center"
          style={{ backgroundImage: 'url(/assets/partner_fallback.jpg)' }}
        >
          {/* Main UI elements */}
          {!isSearching && <div className="absolute inset-0 bg-black/40 z-10" />}

          {/* Dark overlay when searching */}
          {isSearching && (
            <div className="absolute inset-0 bg-black/40 z-20 pointer-events-none" />
          )}

          {/* Center content overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center z-30">
            {/* Logo */}
            <div className="relative flex flex-col items-center h-8 w-28">
              <img
                width="100"
                height="100"
                className={`will-change-transform absolute bottom-1/2 transform -translate-y-1/2 mx-auto h-12 md:h-16 w-auto transition-all duration-500 z-40 ${isSearching ? "cc-animate-zoom-out" : "cc-animate-zoom-in"
                  }`}
                alt="BuzzU Logo"
                aria-label="BuzzU Logo"
                src={buzzuLogo}
              />
              {/* Orbiting circles - only when searching */}
              <div className={`flex justify-center items-center will-change-transform absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 z-30 ${isSearching ? "scale-100 opacity-100" : "scale-0 opacity-0"}`}>
                <div className="absolute size-6 md:size-8 rounded-full bg-gradient-to-br from-white/50 to-transparent bg-cyan-500 cc-animate-circle-1" />
                <div className="absolute size-6 md:size-8 rounded-full bg-gradient-to-br from-white/50 to-transparent bg-orange-400 cc-animate-circle-2" />
                <div className="absolute size-6 md:size-8 rounded-full bg-gradient-to-br from-white/50 to-transparent bg-purple-500 cc-animate-circle-3" />
                <div className="absolute size-6 md:size-8 rounded-full bg-gradient-to-br from-white/50 to-transparent bg-rose-500 cc-animate-circle-4" />
              </div>
            </div>

            {isSearching ? (
              <>
                {/* Searching state content */}
                <div className="flex flex-col justify-center items-center h-full max-h-20">
                  <span className="text-white text-2xl md:text-3xl font-bold opacity-90 tracking-wide transition-all duration-500">
                    Good vibes loading
                    <span className="cc-dot-1">.</span>
                    <span className="cc-dot-2">.</span>
                    <span className="cc-dot-3">.</span>
                  </span>
                </div>
              </>
            ) : (
              <>
                {/* Idle state content */}
                <div className="flex flex-col justify-center items-center h-full max-h-32 gap-3">
                  <div className="flex items-center gap-1.5 transition-all duration-500 opacity-100">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    <span className="text-sm md:text-lg text-white">{videoActiveUsers.toLocaleString()} users online</span>
                  </div>

                  {/* Network Quality Indicator */}
                  <div className="flex flex-col items-center gap-1">
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium backdrop-blur-md border ${quality === 'excellent' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
                      quality === 'good' ? 'bg-blue-500/20 border-blue-500/30 text-blue-400' :
                        quality === 'fair' ? 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400' :
                          'bg-red-500/20 border-red-500/30 text-red-400'
                      }`}>
                      {isUdpBlocked ? <WifiOff size={12} /> : <Wifi size={12} />}
                      <span>
                        {isProbing ? 'Checking connection...' :
                          quality === 'excellent' ? 'Excellent Connection' :
                            quality === 'good' ? 'Good Connection' :
                              quality === 'fair' ? 'Fair Connection' :
                                quality === 'poor' ? 'Poor Connection' : 'UDP Blocked'}
                        {rtt && !isProbing && ` (${rtt.toFixed(0)}ms)`}
                      </span>
                    </div>

                    {warnings.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[10px] text-red-400 font-medium animate-pulse">
                        <AlertTriangle size={10} />
                        <span>{warnings[0]}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Social buttons */}
                <div className="flex justify-center space-x-8 h-10 !mt-6 transition-all duration-500 opacity-100">
                  <button
                    type="button"
                    className="flex items-center justify-center px-4 py-2 bg-[#FF4500]/70 text-white rounded-full hover:bg-[#FF4500] transition-all duration-300 focus:outline-hidden focus:ring-2 focus:ring-orange-600 focus:ring-opacity-50"
                  >
                    <RedditIcon />
                    Reddit
                  </button>
                  <button
                    type="button"
                    className="flex border border-white/10 items-center justify-center px-4 py-2 bg-black/30 text-white rounded-full hover:bg-gray-800 transition-colors duration-300 focus:outline-hidden focus:ring-2 focus:ring-gray-600 focus:ring-opacity-50"
                  >
                    <XIcon />
                    Share
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Start Video Chat button - desktop only, hidden when searching */}
          {!isSearching && (
            <div className="bottom-20 absolute mx-auto z-30 left-1/2 right-1/2 transform -translate-x-1/2 flex justify-center">
              <button
                onClick={onStartChat}
                className="inline-flex cursor-pointer items-center justify-center ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-14 rounded-md px-10 font-semibold sm:flex-none min-h-[55px] gap-2 !rounded-full group/start-btn max-md:px-8 bg-violet-700 hover:bg-violet-800 md:px-16 md:h-16 text-lg normal-case max-lg:hidden text-white"
              >
                <span className="group-hover/start-btn:cc-animate-wave">
                  <WavingHandIcon />
                </span>
                Start Video Chat
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
