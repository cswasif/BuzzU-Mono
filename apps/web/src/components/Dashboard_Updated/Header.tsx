import { useLocation } from 'react-router-dom';
import { useSessionStore } from '../../stores/sessionStore';
import { useState, useCallback, useEffect } from 'react';
import { ConnectionIndicator } from '../Chat/ConnectionIndicator';

interface HeaderProps {
  onMenuClick: () => void;
  onHistoryClick: () => void;
  onFriendRequestsClick: () => void;
  onInboxClick: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  isLeftSidebarOpen: boolean;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onHistoryClick, onFriendRequestsClick, onInboxClick, theme, toggleTheme, isLeftSidebarOpen }) => {
  const { friendRequestsReceived, avatarSeed, isInChat, partnerName, activeDmFriend, partnerId } = useSessionStore();
  const requestCount = Object.keys(friendRequestsReceived).length;
  const location = useLocation();

  // ── Fullscreen toggle ──────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.warn('[Header] Fullscreen toggle failed:', err);
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Dynamic header title — mirrors BuzzU behaviour
  const isDmPage = location.pathname.startsWith('/chat/dm/');
  const isRoomPage = /^\/chat\/new\/[^/]+/.test(location.pathname);
  const headerTitle = isDmPage && activeDmFriend
    ? `@${activeDmFriend.username}`
    : isRoomPage && isInChat && partnerName
      ? `@${partnerName}`
      : 'New Chat';

  return (
    <div className="z-40 flex-row w-full flex items-center flex-grow flex-shrink-0 max-h-12 h-12 p-0 pr-2 shadow-sm border-b border-black/10 dark:border-white/10 bg-background">
      {/* Hamburger menu - always visible on mobile; on desktop, it sits in a w-12 block over the sidebar (or alone) */}
      <div className={`flex h-full flex-none items-center justify-center !pointer-events-auto transition-all duration-300 w-12 ${isLeftSidebarOpen ? 'lg:bg-popover' : ''}`}>
        <span className="mt-1 flex px-2 lg:px-0 lg:ml-2">
          <div className="relative">
            <button type="button" onClick={onMenuClick} className="cursor-pointer block p-2 -ml-2 hover:bg-white/10 rounded-md transition-colors" aria-label="Open menu">
              <svg width="24" height="24" viewBox="0 0 24 24" className="text-foreground" aria-hidden="true" stroke="currentColor">
                <path strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>
          </div>
        </span>
      </div>

      {/* Brand Logo - hidden on mobile. On desktop, expands to fill up to w-64 (along with the w-12 above, total w-64 bg-popover) */}
      <div className={`h-full overflow-hidden hidden lg:flex items-center shrink-0 transition-all duration-300 ${isLeftSidebarOpen ? 'w-[13rem] bg-popover' : 'w-auto'}`}>
        <a className="hidden h-full flex-row items-center gap-2 px-4 text-xl normal-case no-underline hover:no-underline lg:flex" href="/chat/new" title="Home" aria-label="Home">
          <svg width="32" height="32" viewBox="-2.4 -2.4 28.80 28.80" xmlns="http://www.w3.org/2000/svg" fill="#8d96f6" stroke="#8d96f6">
            <g id="SVGRepo_bgCarrier" strokeWidth="0" />
            <g id="SVGRepo_tracerCarrier" strokeLinecap="round" strokeLinejoin="round" stroke="#CCCCCC" strokeWidth="0.336" />
            <g id="SVGRepo_iconCarrier">
              <path d="M19.442 21.355c.55-.19.74-.256.99-.373.342-.152.605-.39.605-.818a.846.846 0 00-.605-.813c-.318-.092-.703.042-.99.122l-5.42 1.46a7.808 7.808 0 01-4.057 0l-5.407-1.46c-.287-.08-.672-.214-.99-.122a.847.847 0 00-.605.813c0 .427.263.666.605.818.25.117.44.184.99.373l5.138 1.79c1.491.52 3.104.52 4.601 0zm-9.263-3.224a7.622 7.622 0 003.636 0l8.01-1.967c.507-.122.709-.165.99-.257.354-.116.605-.415.605-.806a.847.847 0 00-.605-.813c-.281-.08-.697.024-.99.08l-8.664 1.545a6.813 6.813 0 01-2.334 0l-8.652-1.545c-.293-.056-.708-.16-.99-.08a.847.847 0 00-.604.813c0 .39.25.69.604.806.282.092.483.135.99.257zM14.75.621a24.43 24.43 0 00-5.511 0L6.495.933c-.294.03-.715.055-.99.14-.28.092-.605.355-.605.807 0 .39.257.702.605.806.281.08.696.074.99.074h11.01c.293 0 .709.006.99-.074a.835.835 0 00.605-.806c0-.452-.324-.715-.605-.807-.275-.085-.697-.11-.99-.14zm6.037 6.767c.3-.019.709-.037.99-.116a.84.84 0 000-1.614c-.281-.085-.69-.073-.99-.073H3.214c-.3 0-.709-.012-.99.073a.84.84 0 000 1.614c.281.079.69.097.99.116l7.808.556c.642.042 1.308.042 1.943 0zm1.62 4.242c.513-.08.708-.104.989-.202.354-.121.605-.409.605-.806a.84.84 0 00-.605-.806c-.28-.086-.69-.019-.99.012l-9.232.929c-.776.079-1.582.079-2.358 0l-9.22-.93c-.3-.03-.715-.097-.99-.011a.84.84 0 00-.605.806c0 .397.25.685.605.806.275.092.476.123.99.202l8.823 1.418c1.038.165 2.12.165 3.158 0Z" />
            </g>
          </svg>
          <span className="font-bold tracking-tight text-brightness">BuzzU</span>
        </a>
      </div>
      <div className="flex items-center ml-4 gap-2 flex-1 min-w-0">
        <span className="text-md truncate font-bold normal-case cursor-default px-2 text-brightness">{headerTitle}</span>
        {(partnerId || activeDmFriend) && <ConnectionIndicator size="sm" className="flex-shrink-0" tooltipPlacement="bottom" />}
      </div>
      <div className="flex justify-end gap-1 md:gap-2 shrink-0">
        {/* Fullscreen toggle */}
        <button
          onClick={toggleFullscreen}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-11 w-11 rounded-full"
        >
          {isFullscreen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3v3a2 2 0 0 1-2 2H3" /><path d="M21 8h-3a2 2 0 0 1-2-2V3" />
              <path d="M3 16h3a2 2 0 0 1 2 2v3" /><path d="M16 21v-3a2 2 0 0 1 2-2h3" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          )}
        </button>
        <div data-orientation="vertical" role="none" className="shrink-0 bg-border w-[1px] h-4 self-center"></div>
        <button
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-11 w-11 rounded-full relative"
          type="button"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="radix-_r_0_"
          aria-label="Open friend requests"
          data-state="closed"
          onClick={onFriendRequestsClick}
        >
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="21" width="21" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 9a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7m.354 5.854 1.5-1.5a.5.5 0 0 0-.708-.708l-.646.647V10.5a.5.5 0 0 0-1 0v2.793l-.646-.647a.5.5 0 0 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0"></path>
            <path d="M2 13c0 1 1 1 1 1h5.256A4.5 4.5 0 0 1 8 12.5a4.5 4.5 0 0 1 1.544-3.393Q8.844 9.002 8 9c-5 0-6 3-6 4"></path>
          </svg>
          {requestCount > 0 && (
            <div className="inline-flex rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 absolute top-0 right-0 p-0.5 h-4 w-4 items-center justify-center text-[10px]">
              {requestCount}
            </div>
          )}
        </button>
        <button
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-11 w-11 rounded-full relative"
          type="button"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="radix-_r_2_"
          aria-label="Open inbox"
          data-state="closed"
          onClick={onInboxClick}
        >
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="21" width="21" xmlns="http://www.w3.org/2000/svg">
            <path d="M439.39 362.29c-19.32-20.76-55.47-51.99-55.47-154.29 0-77.7-54.48-139.9-127.94-155.16V32c0-17.67-14.32-32-31.98-32s-31.98 14.33-31.98 32v20.84C118.56 68.1 64.08 130.3 64.08 208c0 102.3-36.15 133.53-55.47 154.29-6 6.45-8.66 14.16-8.61 21.71.11 16.4 12.98 32 32.1 32h383.8c19.12 0 32-15.6 32.1-32 .05-7.55-2.61-15.27-8.61-21.71zM67.53 368c21.22-27.97 44.42-74.33 44.53-159.42 0-.2-.06-.38-.06-.58 0-61.86 50.14-112 112-112s112 50.14 112 112c0 .2-.06.38-.06.58.11 85.1 23.31 131.46 44.53 159.42H67.53zM224 512c35.32 0 63.97-28.65 63.97-64H160.03c0 35.35 28.65 64 63.97 64z"></path>
          </svg>
        </button>
        <button
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-11 w-11 rounded-full"
          type="button"
          aria-label="Open chat history"
          data-state="closed"
          onClick={onHistoryClick}
        >
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="text-foreground" height="21" width="21" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.298 22 8.69525 21.5748 7.29229 20.8248L2 22L3.17629 16.7097C2.42562 15.3063 2 13.7028 2 12C2 6.47715 6.47715 2 12 2ZM13 7H11V14H17V12H13V7Z"></path>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default Header;
