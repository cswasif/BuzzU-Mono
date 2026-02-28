import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  InstagramIcon, XIcon, TikTokIcon,
  LightningIcon, MaleIcon, FemaleIcon, BothIcon,
  VideoIcon, TextChatIcon
} from './Icons';
import { ChatArea } from '../Chat/ChatArea';
import { VideoChatArea } from '../Chat/VideoChatArea';

interface MainContentProps {
  onManageInterests: () => void;
}

const interestSets = [
  ['Fashion', 'Gardening', 'Pets'],
  ['Gaming', 'Anime', 'Politics'],
  ['Technology', 'Fashion', 'Gardening'],
  ['Science', 'History', 'Meditation'],
  ['Meditation', 'TikTok', 'Writing']
];

const MainContent: React.FC<MainContentProps> = ({ onManageInterests }) => {
  const [gender, setGender] = useState<'M' | 'both' | 'F'>('both');
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [isChatting, setIsChatting] = useState(false);
  const [isVideoChatting, setIsVideoChatting] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSetIndex((prevIndex) => (prevIndex + 1) % interestSets.length);
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const currentInterests = interestSets[currentSetIndex];

  if (isChatting) {
    return <ChatArea />;
  }

  if (isVideoChatting) {
    return <VideoChatArea />;
  }

  return (
    <main className="w-full flex h-full flex-grow flex-col overflow-hidden">
      <div className="relative h-full bg-background flex flex-col overflow-y-auto">
        <div className="flex-1 flex items-center justify-center flex-col md:space-y-2 space-y-3.5 mb-1.5" style={{ opacity: 1, transform: 'none' }}>

          {/* Central Logo */}
          <div className="flex flex-col space-y-4 items-center justify-center relative z-10 pt-20 md:pt-40">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-600/20 opacity-50 blur-[100px] rounded-full scale-[2.5]"></div>
              <svg width="110" height="110" viewBox="-2.4 -2.4 28.80 28.80" xmlns="http://www.w3.org/2000/svg" fill="#FFD700" stroke="#FFD700" className="relative z-10 drop-shadow-[0_0_20px_rgba(255,215,0,0.25)]">
                <g id="SVGRepo_bgCarrier" strokeWidth="0" />
                <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" stroke="#CCCCCC" strokeWidth="0.336" />
                <g id="SVGRepo_iconCarrier">
                  <path d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835 0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84.0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84.0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84.0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84.0 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z" />
                </g>
              </svg>
            </div>
          </div>

          {/* Social Links */}
          <div className="w-full max-w-52 p-2 rounded-lg">
            <div className="flex justify-center space-x-4">
              <a href="https://instagram.com/chitchat.gg" target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors duration-300 ease-in-out bg-zinc-900/70 hover:bg-zinc-800/90">
                <InstagramIcon className="text-xl" />
              </a>
              <a href="https://x.com/chitchatgg" target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors duration-300 ease-in-out bg-zinc-900/70 hover:bg-zinc-800/90">
                <XIcon className="text-xl" />
              </a>
              <a href="https://tiktok.com/@chitchat.gg" target="_blank" rel="noopener noreferrer" className="w-10 h-10 flex items-center justify-center rounded-full text-white transition-colors duration-300 ease-in-out bg-zinc-900/70 hover:bg-zinc-800/90">
                <TikTokIcon className="text-xl" />
              </a>
            </div>
          </div>

        </div>

        {/* Panel Card */}
        <div className="bg-panel lg:mb-4 lg:rounded-3xl rounded-t-3xl shadow-lg max-w-lg xl:max-w-3xl self-center w-full" style={{ opacity: 1, transform: 'none' }}>
          <div className="flex flex-col p-4 md:p-6 md:pb-2 pb-1.5 space-y-6">

            {/* Interests Section */}
            <div className="space-y-3">
              <div className="space-y-2.5">
                <div className="flex justify-between items-center">
                  <h2 className="lg:text-lg text-base font-medium text-brightness">
                    <span className="text-inherit flex items-center">Your Interests<span className="ml-2 text-xs font-medium text-success">(ON)</span></span>
                  </h2>
                  <span
                    className="text-sm text-panel-foreground cursor-pointer hover:underline"
                    role="button"
                    tabIndex={0}
                    onClick={onManageInterests}
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
                >
                  <div className="border-2 border-dashed border-[hsla(var(--dashed-border)/var(--dashed-border-opacity))] rounded-lg p-3 min-h-[60px] flex items-center">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentSetIndex}
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
                      <button type="button" role="radio" aria-checked={gender === 'M'} onClick={() => setGender('M')} className="sr-only" />
                      <div className="p-0.5">
                        <label
                          className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                            ${gender === 'M'
                              ? 'bg-blue-500/15 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.25)] scale-[1.05]'
                              : 'bg-background/50 border-transparent text-muted-foreground hover:bg-muted opacity-50 hover:opacity-100 hover:scale-100'}`}
                          onClick={() => setGender('M')}
                        >
                          {gender === 'M' && (
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
                      <button type="button" role="radio" aria-checked={gender === 'both'} onClick={() => setGender('both')} className="sr-only" />
                      <div className="p-0.5">
                        <label
                          className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                            ${gender === 'both'
                              ? 'bg-purple-500/15 border-purple-500 text-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.25)] scale-[1.05]'
                              : 'bg-background/50 border-transparent text-muted-foreground hover:bg-muted opacity-50 hover:opacity-100 hover:scale-100'}`}
                          onClick={() => setGender('both')}
                        >
                          {gender === 'both' && (
                            <div className="absolute -top-2 -right-2 items-center justify-center flex bg-purple-500 text-white w-5 h-5 rounded-full shadow-lg shadow-purple-500/50 animate-in zoom-in duration-200">
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
                      <button type="button" role="radio" aria-checked={gender === 'F'} onClick={() => setGender('F')} className="sr-only" />
                      <div className="p-0.5">
                        <label
                          className={`font-bold w-full min-w-[76px] sm:w-24 relative flex select-none flex-col items-center justify-between rounded-xl p-3 cursor-pointer text-sm border-2 transition-all duration-300 ease-out
                            ${gender === 'F'
                              ? 'bg-pink-500/15 border-pink-500 text-pink-400 shadow-[0_0_20px_rgba(236,72,153,0.25)] scale-[1.05]'
                              : 'bg-background/50 border-transparent text-muted-foreground hover:bg-muted opacity-50 hover:opacity-100 hover:scale-100'}`}
                          onClick={() => setGender('F')}
                        >
                          {gender === 'F' && (
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
              <button type="button" onClick={() => setIsVideoChatting(true)} className="group relative overflow-hidden inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 bg-gradient-to-br from-orange-500 to-red-600 text-white rounded-xl transition-all duration-300 ease-in-out shadow-[0_4px_14px_0_rgba(249,115,22,0.39)] hover:shadow-[0_6px_20px_rgba(249,115,22,0.6)] hover:-translate-y-1 hover:brightness-110 active:translate-y-0 active:scale-95 min-h-[52px] min-w-[52px] lg:min-h-[60px] lg:min-w-[60px]">
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <VideoIcon className="lg:w-6 lg:h-6 relative z-10 drop-shadow-md transition-transform group-hover:scale-110 duration-300" />
              </button>
              <button
                type="button"
                onClick={() => setIsChatting(true)}
                className="group relative overflow-hidden inline-flex items-center justify-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 px-6 flex-1 text-white bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl font-bold transition-all duration-300 ease-in-out shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] hover:shadow-[0_6px_20px_rgba(99,102,241,0.6)] hover:-translate-y-1 hover:brightness-110 active:translate-y-0 active:scale-95 min-h-[52px] lg:min-h-[60px] lg:text-lg"
              >
                <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <TextChatIcon className="w-6 h-6 mr-2 lg:w-7 lg:h-7 relative z-10 drop-shadow-md transition-transform group-hover:scale-110 duration-300" />
                <span className="relative z-10 tracking-wider drop-shadow-md">START TEXT CHAT</span>
              </button>
            </div>

          </div>

          <span className="text-xs md:text-xs text-foreground-muted w-full self-center text-center flex items-center justify-center pb-1.5 md:pb-2 gap-1">
            <span>Be respectful and follow our</span>
            <a href="https://www.chitchat.gg/guidelines" target="_blank" rel="noreferrer" className="underline text-[hsl(var(--link-color))]">chat rules</a>
          </span>
        </div>
      </div>
    </main>
  );
};

export default MainContent;
