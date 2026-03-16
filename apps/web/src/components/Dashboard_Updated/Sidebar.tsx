import React, { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import { useScreenShareStore } from '../../stores/screenShareStore';
import { useVoiceChatStore } from '../../stores/voiceChatStore';
import {
  LogoIcon,
  MicIcon, SoundIcon, SettingsIcon, MenuIcon, ScreenShareIcon, ScreenShareStopIcon
} from './Icons';
import SidebarList from './SidebarList';
import SettingsPopover from './SettingsPopover';
import ProfilePopover from './ProfilePopover';
import PremiumCard from './PremiumCard';

interface SidebarProps {
  activeTab: 'chat' | 'friends';
  setActiveTab: (tab: 'chat' | 'friends') => void;
  onEditProfile: () => void;
  isOpen: boolean;
  onClose: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, onEditProfile, isOpen, onClose, theme, toggleTheme }) => {
  const { displayName, avatarSeed, avatarUrl, isInChat } = useSessionStore();
  const { isLocalSharing, requestStart, requestStop } = useScreenShareStore();
  const { isMicOn, requestStart: requestMicStart, requestStop: requestMicStop } = useVoiceChatStore();
  const dicebearUrl = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
  const avatarSrc = avatarUrl || dicebearUrl;
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    };

    if (showSettings || showProfile) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showSettings, showProfile]);

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 z-20 bg-black/50 lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 
        h-full w-64 min-w-64 bg-panel lg:bg-popover border-r-0 flex flex-col
        transition-all duration-300 ease-in-out
        ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 lg:w-0 lg:min-w-0 pointer-events-none'}
      `}>
        {/* Mobile Header in Sidebar */}
        <div className="flex h-12 w-full items-center justify-between px-4 lg:hidden border-b border-black/20 dark:border-white/10 shrink-0">
          <span className="font-bold text-lg">Menu</span>
          <button onClick={onClose} className="p-1">
            <MenuIcon />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <SidebarList activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>

        {/* Footer */}
        <div className="flex-shrink-0">
          {/* PremiumCard hidden per user request */}
          <div className="bg-panel px-1 relative z-10">
            {/* Room Action Buttons */}
            <div className="px-1.5 py-1.5 space-y-1 mt-1">
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-join-room-modal'))}
                className="group w-full flex items-center gap-2.5 p-1.5 hover:bg-accent disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-all text-foreground"
              >
                <div className="flex shrink-0 items-center justify-center h-7 w-7 rounded-md bg-zinc-500/10 text-zinc-500 group-hover:bg-zinc-500/20 group-hover:text-foreground transition-all duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <span className="font-semibold text-foreground/80 group-hover:text-foreground transition-colors">Join Room</span>
              </button>

              <button
                onClick={() => window.dispatchEvent(new CustomEvent('join-room-type', { detail: { type: 'help' } }))}
                className="group w-full flex items-center gap-2.5 p-1.5 hover:bg-accent disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-all text-foreground"
              >
                <div className="flex shrink-0 items-center justify-center h-7 w-7 rounded-md bg-blue-500/10 text-blue-500 group-hover:bg-blue-500/20 group-hover:text-blue-400 transition-all duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <path d="M12 17h.01" />
                  </svg>
                </div>
                <span className="font-semibold text-foreground/80 group-hover:text-foreground transition-colors">Help Channel</span>
              </button>

              {useSessionStore.getState().adminAccessKey && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('join-room-type', { detail: { type: 'admin' } }))}
                  className="group w-full flex items-center gap-2.5 p-1.5 hover:bg-accent disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 transition-all text-[#8d96f6]"
                >
                  <div className="flex shrink-0 items-center justify-center h-7 w-7 rounded-md bg-[#8d96f6]/10 text-[#8d96f6] group-hover:bg-[#8d96f6]/20 group-hover:text-[#8d96f6] transition-all duration-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                    </svg>
                  </div>
                  <span className="font-semibold text-foreground/80 group-hover:text-foreground transition-colors">Admin Channel</span>
                </button>
              )}
            </div>

            <div className="shrink-0 bg-border h-[1px] w-full mt-0.5 mb-1.5"></div>

            {/* User Profile */}
            <div className="flex flex-row items-center gap-0.5 rounded-sm pb-1">
              <div className="relative grow" ref={profileRef}>
                <button
                  onClick={() => setShowProfile(!showProfile)}
                  className="disabled:select-none rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 inline-flex w-full items-center justify-start gap-2 p-1"
                >
                  <div className="relative">
                    <span className="flex shrink-0 overflow-hidden relative h-8 w-8 rounded-full">
                      <img className="aspect-square h-full w-full" alt={displayName} src={avatarSrc} />
                    </span>
                    <div className="absolute rounded-full ring-2 ring-zinc-700 h-2 w-2 bottom-0 right-0 mr-[1px] mb-[1px] bg-success"></div>
                  </div>
                  <div className="flex w-20 flex-col items-start justify-around self-center">
                    <span className="w-full text-start truncate text-sm font-bold leading-4">{displayName}</span>
                    <span className="text-xs leading-3">Free</span>
                  </div>
                </button>
                {showProfile && (
                  <ProfilePopover
                    onClose={() => setShowProfile(false)}
                    onEditProfile={() => {
                      setShowProfile(false);
                      onEditProfile();
                    }}
                  />
                )}
              </div>
              <button
                onClick={() => isMicOn ? requestMicStop() : requestMicStart()}
                disabled={!isInChat}
                title={!isInChat ? 'Join a chat to use mic' : isMicOn ? 'Mute mic' : 'Unmute mic'}
                className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8 transition-colors ${isMicOn ? 'text-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30' : ''
                  }`}
              >
                {isMicOn ? <MicIcon /> : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .71-.11 1.39-.3 2.05" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                )}
              </button>
              <button className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8">
                <SoundIcon />
              </button>
              <button
                onClick={() => isLocalSharing ? requestStop() : requestStart()}
                disabled={!isInChat}
                title={!isInChat ? 'Join a chat to share screen' : isLocalSharing ? 'Stop sharing' : 'Share your screen'}
                className={`inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8 transition-colors ${isLocalSharing ? 'text-emerald-400 bg-emerald-500/20 hover:bg-emerald-500/30' : ''
                  }`}
              >
                {isLocalSharing ? <ScreenShareStopIcon /> : <ScreenShareIcon />}
              </button>
              <div className="relative w-10" ref={settingsRef}>
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10"
                >
                  <SettingsIcon />
                </button>
                {showSettings && <SettingsPopover theme={theme} onToggleTheme={toggleTheme} />}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
