import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  InstagramIcon, XIcon, TikTokIcon,
  LightningIcon, MaleIcon, FemaleIcon, BothIcon,
  VideoIcon, TextChatIcon
} from './Icons';
import { ChatArea } from '../Chat/ChatArea';
import type { RoomType } from '../Chat/ChatArea';
import { JoinRoomModal } from './JoinRoomModal';
import { GenderSelectionModal } from './GenderSelectionModal';
import { useSessionStore } from '../../stores/sessionStore';
import { useMatching } from '../../hooks/useMatching';

interface MainContentProps {
  onManageInterests: () => void;
  activeArea: 'main' | 'chat';
  setActiveArea: (area: 'main' | 'chat') => void;
  roomId?: string;
  suppressEmbeddedChat?: boolean;
}

const interestSets = [
  ['Fashion', 'Gardening', 'Pets'],
  ['Gaming', 'Anime', 'Politics'],
  ['Technology', 'Fashion', 'Gardening'],
  ['Science', 'History', 'Meditation'],
  ['Meditation', 'TikTok', 'Writing']
];

export default function MainContent({ onManageInterests, activeArea, setActiveArea, roomId, suppressEmbeddedChat = false }: MainContentProps) {
  const navigate = useNavigate();
  const { gender, genderFilter, setGender, setGenderFilter, interests, avatarSeed, genderModalDismissed, setGenderModalDismissed, adminAccessKey } = useSessionStore();
  const { textActiveUsers, videoActiveUsers } = useMatching();
  const [currentInterestSet, setCurrentInterestSet] = useState(0);

  // Modal state
  const [showGenderModal, setShowGenderModal] = useState(false);
  const hasSelectedGender = gender === 'M' || gender === 'F';

  // Room type state for direct-connect mode
  const [roomTypeState, setRoomTypeState] = useState<{ type: RoomType; roomCode?: string; roomKey?: string } | null>(null);
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);

  // Listen for custom events from Sidebar
  useEffect(() => {
    const handleOpenJoinModal = () => {
      setShowJoinRoomModal(true);
    };

    const handleJoinRoomType = (event: CustomEvent<{ type: RoomType }>) => {
      setRoomTypeState({ type: event.detail.type });
      setActiveArea('chat');
    };

    window.addEventListener('open-join-room-modal', handleOpenJoinModal as EventListener);
    window.addEventListener('join-room-type', handleJoinRoomType as EventListener);

    return () => {
      window.removeEventListener('open-join-room-modal', handleOpenJoinModal as EventListener);
      window.removeEventListener('join-room-type', handleJoinRoomType as EventListener);
    };
  }, [setActiveArea]);

  const handleStartTextChat = () => {
    // Check if they need to provide gender
    if (!hasSelectedGender) {
      setShowGenderModal(true);
      return;
    }
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('buzzu:skip-view-state');
      sessionStorage.removeItem('buzzu:suppress-chat-autostart-once');
    }
    navigate('/chat/text');
  };

  const handleGenderConfirm = (selectedGender: 'M' | 'F') => {
    // Save to user profile on the backend (Zustand session store)
    setGender(selectedGender);
    setGenderModalDismissed(true);
    setShowGenderModal(false);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentInterestSet((prevIndex) => (prevIndex + 1) % interestSets.length);
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Auto-open gender selection modal on first visit if gender is not set
  // and the user hasn't explicitly dismissed it already
  useEffect(() => {
    if (!hasSelectedGender && !genderModalDismissed) {
      setShowGenderModal(true);
    }
  }, [hasSelectedGender, genderModalDismissed]);

  const currentInterests = interests.length > 0 ? interests : interestSets[currentInterestSet];

  if (activeArea === 'chat') {
    if (suppressEmbeddedChat) {
      return null;
    }
    if (roomTypeState) {
      return (
        <ChatArea
          roomId={roomTypeState.roomCode}
          roomType={roomTypeState.type}
          roomKey={roomTypeState.roomKey}
          accessKey={roomTypeState.type === 'admin' ? adminAccessKey : undefined}
          onLeaveRoom={() => { setRoomTypeState(null); setActiveArea('main'); }}
        />
      );
    }
    return <ChatArea roomId={roomId} />;
  }

  return (
    <>
      <main className="w-full flex h-full flex-grow flex-col overflow-hidden relative">
        <div className="relative h-full bg-background flex flex-col overflow-y-auto pt-8 md:pt-12">
          <div className="flex-none flex items-center justify-start flex-col space-y-4 mb-4" style={{ opacity: 1, transform: 'none' }}>

            {/* Central Logo & Brand */}
            <div className="flex flex-col items-center justify-center relative z-10">
              <div className="relative mb-2">
                <div className="absolute inset-0 bg-[#8d96f6]/10 blur-[60px] rounded-full scale-[2]"></div>
                <svg width="64" height="64" viewBox="-2.4 -2.4 28.80 28.80" xmlns="http://www.w3.org/2000/svg" fill="#8d96f6" stroke="#8d96f6" className="relative z-10 drop-shadow-[0_0_15px_rgba(141,150,246,0.15)]">
                  <g id="SVGRepo_bgCarrier" strokeWidth="0" />
                  <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" stroke="#CCCCCC" strokeWidth="0.336" />
                  <g id="SVGRepo_iconCarrier">
                    <path d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835.0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84.0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84.0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84.0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84.0 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z" />
                  </g>
                </svg>
              </div>
              <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-brightness mb-4">
                BuzzU
              </h1>
            </div>

            {/* Social Links */}
            <div className="flex justify-center space-x-3 mb-2">
              <a href="https://instagram.com/buzzu" aria-label="BuzzU on Instagram" target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-full text-white transition-all duration-300 bg-zinc-900/60 hover:bg-zinc-800/90 hover:scale-110">
                <InstagramIcon className="text-lg" />
              </a>
              <a href="https://x.com/buzzu" aria-label="BuzzU on X" target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-full text-white transition-all duration-300 bg-zinc-900/60 hover:bg-zinc-800/90 hover:scale-110">
                <XIcon className="text-lg" />
              </a>
              <a href="https://tiktok.com/@buzzu" aria-label="BuzzU on TikTok" target="_blank" rel="noopener noreferrer" className="w-9 h-9 flex items-center justify-center rounded-full text-white transition-all duration-300 bg-zinc-900/60 hover:bg-zinc-800/90 hover:scale-110">
                <TikTokIcon className="text-lg" />
              </a>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/50 backdrop-blur-sm px-3 py-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {videoActiveUsers} video
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-indigo-300">
                <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
                {textActiveUsers} text
              </span>
            </div>



          </div>

          {/* Flexible spacer to push the card to bottom on mobile */}
          <div className="flex-grow" />

          {/* Panel Card */}
          <div className="bg-panel lg:mb-4 lg:rounded-3xl rounded-t-3xl shadow-lg max-w-lg xl:max-w-3xl self-center w-full" style={{ opacity: 1, transform: 'none' }}>
            <div className="flex flex-col p-4 md:p-5 md:pb-2 pb-1.5 space-y-4">

              {/* Interests Section */}
              <div className="space-y-3">
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h2 className="lg:text-lg text-base font-medium text-brightness">
                      <span className="text-inherit flex items-center">Your Interests<span className="ml-2 font-semibold" style={{ color: 'hsl(var(--success))', fontSize: '0.95rem' }}>(ON)</span></span>
                    </h2>
                    <span
                      className="text-sm text-panel-foreground cursor-pointer hover:underline"
                      role="button"
                      tabIndex={0}
                      onClick={onManageInterests}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onManageInterests();
                        }
                      }}
                    >
                      Manage
                    </span>
                  </div>
                  <div
                    className="mb-4 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label="Edit interests"
                    onClick={onManageInterests}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onManageInterests();
                      }
                    }}
                  >
                    <div className="rounded-lg border-2 border-dashed p-3" style={{ borderColor: 'hsla(var(--dashed-border), 0.42)' }}>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={currentInterestSet}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="flex flex-wrap gap-2 mb-1.5"
                        >
                          {currentInterests.map(i => (
                            <div key={i} className="bg-[hsla(var(--pill-bg)/var(--pill-bg-opacity))] text-[hsla(var(--pill-text)/var(--pill-text-opacity))] text-sm font-medium px-3 py-1.5 rounded-full overflow-hidden">
                              <span className="inline-block">{i}</span>
                            </div>
                          ))}
                        </motion.div>
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Gender Filter */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <h2 className="lg:text-lg text-base font-medium text-brightness">Gender Filter:</h2>
                  </div>
                  <div className="flex justify-center">
                    <div role="radiogroup" className="flex justify-center gap-3 sm:gap-6 w-full" style={{ outline: 'none' }}>

                      {/* Male Option */}
                      <div className="max-sm:w-full relative group">
                        <button type="button" role="radio" aria-checked={genderFilter === 'male'} onClick={() => setGenderFilter('male')} className="sr-only" />
                        <div className="p-0.5">
                          <label
                            className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                              ${genderFilter === 'male'
                                ? 'bg-blue-500/15 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.25)] scale-[1.05]'
                                : 'bg-background/50 border-brightness/20 dark:border-brightness/10 text-muted-foreground hover:bg-muted opacity-80 hover:opacity-100 hover:scale-100'}`}
                            onClick={() => setGenderFilter('male')}
                          >
                            {genderFilter === 'male' && (
                              <div className="absolute -top-2 -right-2 items-center justify-center flex bg-blue-500 text-white w-5 h-5 rounded-full shadow-lg shadow-blue-500/50 animate-in zoom-in duration-200">
                                <LightningIcon className="w-3 h-3" />
                              </div>
                            )}
                            <MaleIcon className="mb-2 w-7 h-7 text-inherit transition-transform group-hover:scale-110" />
                            Male
                          </label>
                        </div>
                      </div>

                      {/* Both Option */}
                      <div className="max-sm:w-full relative group">
                        <button type="button" role="radio" aria-checked={genderFilter === 'both'} onClick={() => setGenderFilter('both')} className="sr-only" />
                        <div className="p-0.5">
                          <label
                            className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                              ${genderFilter === 'both'
                                ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.25)] scale-[1.05]'
                                : 'bg-background/50 border-brightness/20 dark:border-brightness/10 text-muted-foreground hover:bg-muted opacity-80 hover:opacity-100 hover:scale-100'}`}
                            onClick={() => setGenderFilter('both')}
                          >
                            {genderFilter === 'both' && (
                              <div className="absolute -top-2 -right-2 items-center justify-center flex bg-emerald-500 text-white w-5 h-5 rounded-full shadow-lg shadow-emerald-500/50 animate-in zoom-in duration-200">
                                <LightningIcon className="w-3 h-3" />
                              </div>
                            )}
                            <BothIcon className="mb-2 w-7 h-7 text-inherit transition-transform group-hover:scale-110" />
                            Both
                          </label>
                        </div>
                      </div>

                      {/* Female Option */}
                      <div className="max-sm:w-full relative group">
                        <button type="button" role="radio" aria-checked={genderFilter === 'female'} onClick={() => setGenderFilter('female')} className="sr-only" />
                        <div className="p-0.5">
                          <label
                            className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                              ${genderFilter === 'female'
                                ? 'bg-pink-500/15 border-pink-500 text-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.25)] scale-[1.05]'
                                : 'bg-background/50 border-brightness/20 dark:border-brightness/10 text-muted-foreground hover:bg-muted opacity-80 hover:opacity-100 hover:scale-100'}`}
                            onClick={() => setGenderFilter('female')}
                          >
                            {genderFilter === 'female' && (
                              <div className="absolute -top-2 -right-2 items-center justify-center flex bg-pink-500 text-white w-5 h-5 rounded-full shadow-lg shadow-pink-500/50 animate-in zoom-in duration-200">
                                <LightningIcon className="w-3 h-3" />
                              </div>
                            )}
                            <FemaleIcon className="mb-2 w-7 h-7 text-inherit transition-transform group-hover:scale-110" />
                            Female
                          </label>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2.5 mt-6 self-center w-full max-w-sm">
                <button
                  onClick={() => {
                    if (!hasSelectedGender) {
                      setShowGenderModal(true);
                      return;
                    }
                    navigate('/chat/video');
                  }}
                  className="group relative overflow-hidden inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-xl transition-all duration-300 ease-in-out shadow-[0_4px_14px_0_rgba(249,115,22,0.39)] hover:shadow-[0_6px_20px_rgba(249,115,22,0.6)] hover:-translate-y-1 hover:brightness-110 active:translate-y-0 active:scale-95 min-h-[52px] min-w-[52px] lg:min-h-[60px] lg:min-w-[60px]"
                >
                  <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <VideoIcon className="lg:w-6 lg:h-6 relative z-10 drop-shadow-md transition-transform group-hover:scale-110 duration-300" />
                </button>
                <button
                  className="inline-flex disabled:select-none items-center justify-center text-sm ring-offset-background disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 px-4 flex-1 !text-white bg-gradient-to-r from-indigo-600 to-emerald-700 py-6 rounded-xl font-semibold hover:from-indigo-700 hover:to-emerald-800 transition-all duration-300 shadow-md hover:shadow-lg lg:py-6 lg:text-lg active:scale-[0.98]"
                  onClick={handleStartTextChat}
                >
                  <TextChatIcon className="w-6 h-6 mr-2 lg:w-7 lg:h-7" />
                  Start Text Chat
                </button>
              </div>

            </div>

            <span className="text-xs md:text-xs text-foreground-muted w-full self-center text-center flex items-center justify-center pb-1.5 md:pb-2 gap-1 mt-3">
              <span>Be respectful and follow our</span>
              <a href="/guidelines" className="underline text-[hsl(var(--link-color))]">chat rules</a>
            </span>
          </div>
        </div>
      </main>

      {/* Embedded Modals */}
      <GenderSelectionModal
        isOpen={showGenderModal}
        onConfirm={handleGenderConfirm}
      />

      <JoinRoomModal
        isOpen={showJoinRoomModal}
        onClose={() => setShowJoinRoomModal(false)}
        onJoin={(roomCode, roomKey) => {
          setRoomTypeState({ type: 'private', roomCode, roomKey: roomKey || undefined });
          setActiveArea('chat');
        }}
      />
    </>
  );
}
