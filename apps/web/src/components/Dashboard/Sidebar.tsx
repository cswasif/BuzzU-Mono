import React, { useState, useEffect, useRef } from 'react';
import { useSessionStore } from '../../stores/sessionStore';
import {
  LogoIcon,
  MicIcon, SoundIcon, SettingsIcon, MenuIcon
} from './Icons';
import SidebarList from './SidebarList';
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
  const { displayName, avatarSeed, avatarUrl } = useSessionStore();
  const dicebearUrl = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
  const avatarSrc = avatarUrl || dicebearUrl;
  const [showProfile, setShowProfile] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfile(false);
      }
    };

    if (showProfile) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showProfile]);

  return (
    <>
      {/* Mobile Overlay */}
      <div
        className={`fixed inset-0 z-20 bg-black/50 lg:hidden transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-30 
        h-full w-64 min-w-64 bg-popover border-r border-border/10 flex flex-col
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Mobile Header in Sidebar */}
        <div className="flex h-12 w-full items-center justify-between px-4 lg:hidden border-b border-border/10 shrink-0">
          <span className="font-bold text-lg">Menu</span>
          <button onClick={onClose} className="p-1" aria-label="Close menu" title="Close menu">
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
            <div className="shrink-0 bg-border h-[1px] w-full my-1.5"></div>

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
                className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8"
                title="Mic"
                aria-label="Mic"
              >
                <MicIcon />
              </button>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('open-settings-modal'))}
                className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8"
                title="Settings"
                aria-label="Settings"
              >
                <SettingsIcon />
              </button>
              <button
                className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground w-8 h-8"
                title="Sound"
                aria-label="Sound"
              >
                <SoundIcon />
              </button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
