import React from 'react';
import { MenuIcon, BellIcon, UserIncomingIcon, HistoryIcon } from './Icons';

interface HeaderProps {
  onMenuClick: () => void;
  onHistoryClick: () => void;
  onFriendRequestsClick: () => void;
  onInboxClick: () => void;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ onMenuClick, onHistoryClick, onFriendRequestsClick, onInboxClick, theme, toggleTheme }) => {
  return (
    <div className="z-20 flex-row w-full flex items-center flex-grow flex-shrink-0 max-h-12 h-12 p-0 pr-2 shadow-md">
      <div className="flex h-full flex-none items-center justify-center lg:hidden !pointer-events-auto">
        <span className="mt-1 flex px-2">
          <div className="relative">
            <span onClick={onMenuClick} className="cursor-pointer">
              <svg width="23" height="23" viewBox="0 0 23 23" className="[&>*]:stroke-brightness" aria-hidden="true">
                <path fill="transparent" strokeWidth="3" stroke="white" strokeLinecap="round" d="M 2 2.5 L 20 2.5"></path>
                <path fill="transparent" strokeWidth="3" stroke="white" strokeLinecap="round" d="M 2 9.423 L 20 9.423" opacity="1"></path>
                <path fill="transparent" strokeWidth="3" stroke="white" strokeLinecap="round" d="M 2 16.346 L 20 16.346"></path>
              </svg>
            </span>
          </div>
        </span>
      </div>
      <div className="h-full overflow-hidden lg:mr-2 lg:w-62 lg:bg-popover">
        <a className="hidden h-full flex-row items-center gap-1 px-2 text-xl normal-case no-underline hover:no-underline lg:flex" href="/chat/new" title="Home" aria-label="Home">
          <img loading="lazy" alt="logo" width="150.66666666666666" height="34.666666666666664" src="/images/logo-darkmode.png" />
        </a>
      </div>
      <span className="text-md truncate font-bold normal-case sm:ml-1 cursor-default" role="button" tabIndex={0}>New Chat</span>
      <div className="flex flex-1 justify-end gap-1 md:gap-2">
        <div data-orientation="vertical" role="none" className="shrink-0 bg-border w-[1px] h-4 self-center"></div>
        <button
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full relative"
          type="button"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="radix-_r_0_"
          data-state="closed"
          onClick={onFriendRequestsClick}
        >
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="21" width="21" xmlns="http://www.w3.org/2000/svg">
            <path d="M12.5 9a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7m.354 5.854 1.5-1.5a.5.5 0 0 0-.708-.708l-.646.647V10.5a.5.5 0 0 0-1 0v2.793l-.646-.647a.5.5 0 0 0-.708.708l1.5 1.5a.5.5 0 0 0 .708 0M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0"></path>
            <path d="M2 13c0 1 1 1 1 1h5.256A4.5 4.5 0 0 1 8 12.5a4.5 4.5 0 0 1 1.544-3.393Q8.844 9.002 8 9c-5 0-6 3-6 4"></path>
          </svg>
          <div className="inline-flex rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80 absolute top-0 right-0 p-0.5 h-4 w-4 items-center justify-center text-xs">1</div>
        </button>
        <button
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full relative"
          type="button"
          aria-haspopup="dialog"
          aria-expanded="false"
          aria-controls="radix-_r_2_"
          data-state="closed"
          onClick={onInboxClick}
        >
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 448 512" height="21" width="21" xmlns="http://www.w3.org/2000/svg">
            <path d="M439.39 362.29c-19.32-20.76-55.47-51.99-55.47-154.29 0-77.7-54.48-139.9-127.94-155.16V32c0-17.67-14.32-32-31.98-32s-31.98 14.33-31.98 32v20.84C118.56 68.1 64.08 130.3 64.08 208c0 102.3-36.15 133.53-55.47 154.29-6 6.45-8.66 14.16-8.61 21.71.11 16.4 12.98 32 32.1 32h383.8c19.12 0 32-15.6 32.1-32 .05-7.55-2.61-15.27-8.61-21.71zM67.53 368c21.22-27.97 44.42-74.33 44.53-159.42 0-.2-.06-.38-.06-.58 0-61.86 50.14-112 112-112s112 50.14 112 112c0 .2-.06.38-.06.58.11 85.1 23.31 131.46 44.53 159.42H67.53zM224 512c35.32 0 63.97-28.65 63.97-64H160.03c0 35.35 28.65 64 63.97 64z"></path>
          </svg>
        </button>
        <button
          className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full"
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
