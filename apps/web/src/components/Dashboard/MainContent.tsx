import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  InstagramIcon, XIcon, TikTokIcon,
  LightningIcon, MaleIcon, FemaleIcon, BothIcon,
  VideoIcon, TextChatIcon
} from './Icons';

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

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSetIndex((prevIndex) => (prevIndex + 1) % interestSets.length);
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, []);

  const currentInterests = interestSets[currentSetIndex];

  return (
    <main className="w-full flex h-full flex-grow flex-col overflow-hidden">
      <div className="relative h-dvh bg-gradient-to-b from-background to-background flex flex-col overflow-y-auto">
        <div className="flex-1 flex items-center justify-center flex-col md:space-y-2 space-y-3.5 mb-1.5" style={{ opacity: 1, transform: 'none' }}>

          {/* Central Logo */}
          <div className="flex flex-col space-y-4 items-center justify-center relative z-10 pt-20 md:pt-40">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-emerald-600/20 opacity-50 blur-[100px] rounded-full scale-[2.5]"></div>
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
                  <div className="border-2 border-dashed border-black border-opacity-20 dark:border-white dark:border-opacity-20 rounded-lg p-3 min-h-[60px] flex items-center">
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
                          <div key={i} className="dark:bg-white dark:bg-opacity-10 bg-black bg-opacity-70 text-brightness-foreground text-opacity-40 text-sm font-medium px-3 py-1.5 rounded-full overflow-hidden">
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
                      <button
                        type="button"
                        role="radio"
                        aria-checked={gender === 'M'}
                        onClick={() => setGender('M')}
                        className="sr-only"
                      />
                      <div className="rounded p-0.5">
                        <label
                          className={`font-medium w-full min-w-16 sm:w-20 relative flex select-none flex-col text-blue-600 dark:text-blue-300 items-center justify-between rounded-sm bg-popover p-1.5 hover:bg-muted cursor-pointer hover:text-accent-foreground text-sm border border-brightness/20 dark:border-brightness/10 ${gender === 'M' ? 'bg-muted border-primary' : ''}`}
                          onClick={() => setGender('M')}
                        >
                          <div className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 items-center justify-center flex bg-orange-600 text-brightness w-5 h-5 rounded-full">
                            <LightningIcon className="w-4 h-4" />
                          </div>
                          <MaleIcon className="mb-1 sm:mb-2 text-inherit" />
                          Male
                        </label>
                      </div>
                    </div>

                    {/* Both Option */}
                    <div className="max-sm:w-full relative group">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={gender === 'both'}
                        onClick={() => setGender('both')}
                        className="sr-only"
                      />
                      <div className={`rounded p-0.5 ${gender === 'both' ? 'bg-gradient-to-r from-blue-400 to-pink-400 relative after:content-[""] after:absolute after:inset-0 after:bg-gradient-to-r after:from-blue-400/20 after:to-pink-400/20 after:blur-xl after:rounded-lg' : ''}`}>
                        <label
                          className={`font-medium w-full min-w-16 sm:w-20 relative select-none flex flex-col items-center justify-between rounded-sm bg-popover p-1.5 hover:bg-muted cursor-pointer hover:text-accent-foreground text-sm border border-brightness/20 dark:border-brightness/10 ${gender === 'both' ? 'bg-muted border-primary' : ''}`}
                          onClick={() => setGender('both')}
                        >
                          <BothIcon className="mb-1 sm:mb-2 text-inherit" />
                          Both
                        </label>
                      </div>
                    </div>

                    {/* Female Option */}
                    <div className="max-sm:w-full relative group">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={gender === 'F'}
                        onClick={() => setGender('F')}
                        className="sr-only"
                      />
                      <div className="rounded p-0.5">
                        <label
                          className={`font-medium relative w-full min-w-16 sm:w-20 flex select-none flex-col text-pink-600 dark:text-pink-300 items-center justify-between rounded-sm bg-popover p-1.5 hover:bg-muted cursor-pointer hover:text-accent-foreground text-sm border border-brightness/20 dark:border-brightness/10 ${gender === 'F' ? 'bg-muted border-primary' : ''}`}
                          onClick={() => setGender('F')}
                        >
                          <div className="absolute top-0 right-0 transform translate-x-1/2 -translate-y-1/2 items-center justify-center flex bg-orange-600 text-brightness w-5 h-5 rounded-full">
                            <LightningIcon className="w-4 h-4" />
                          </div>
                          <FemaleIcon className="mb-1 sm:mb-2 text-inherit" />
                          Female
                        </label>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>

            {/* Start Buttons */}
            <div className="flex space-x-2.5 mt-6 self-center w-full max-w-sm">
              <a href="/start/new" className="inline-flex disabled:select-none items-center justify-center text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 bg-gradient-to-r from-orange-500 to-red-400 text-white p-1 rounded-xl font-semibold hover:from-orange-600 hover:to-red-500 transition-all duration-300 shadow-md h-12 w-12 lg:h-14 lg:w-14">
                <VideoIcon className="lg:w-6 lg:h-6" />
              </a>
              <a href="/start/new" className="inline-flex disabled:select-none items-center justify-center text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-primary/90 h-10 px-4 flex-1 !text-white bg-gradient-to-r from-indigo-600 to-emerald-700 text-brightness py-6 rounded-xl font-semibold hover:from-indigo-600 hover:to-emerald-600 transition-all duration-300 shadow-md hover:shadow-lg lg:py-7 lg:text-lg">
                <TextChatIcon className="w-6 h-6 mr-2 lg:w-7 lg:h-7" />
                Start Text Chat
              </a>
            </div>

          </div>

          <span className="text-xs md:text-xs text-foreground-muted w-full self-center text-center flex items-center justify-center pb-1.5 md:pb-2 gap-1">
            <span>Be respectful and follow our</span>
            <a href="https://www.chitchat.gg/guidelines" target="_blank" rel="noreferrer" className="underline text-blue-800 dark:text-blue-400">chat rules</a>
          </span>
        </div>
      </div>
    </main>
  );
};

export default MainContent;
