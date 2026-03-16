import React from 'react';
import { Menu, Users, Bell, MessageCircle } from 'lucide-react';

export function TopBar() {
  return (
    <div className="flex h-full flex-col select-none fixed top-0 left-0 w-full z-20 pointer-events-none">
      <span className="flex h-8 w-full flex-row items-center justify-center bg-[#ff6321] p-2 text-center text-sm pointer-events-auto">
        <p className="text-xs md:text-sm text-white">You're using an anonymous account. all changes will be lost after logging out</p>
        <button className="inline-flex disabled:select-none items-center justify-center font-bold ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-white text-black hover:bg-white/90 h-6 rounded-md mx-1 sm:mx-2 px-2 text-xs md:text-sm transition-colors">
          Claim Account
        </button>
      </span>
      <div className="z-20 flex-row w-full flex items-center flex-grow flex-shrink-0 max-h-12 h-12 p-0 pr-2 bg-background pointer-events-auto">
        <div className="flex h-full flex-none items-center justify-center lg:hidden !pointer-events-auto">
          <span className="mt-1 flex px-2">
            <div className="relative">
              <button type="button" aria-label="Open menu">
                <Menu className="w-[23px] h-[23px] text-foreground" />
              </button>
            </div>
          </span>
        </div>
        <div className="h-full overflow-hidden lg:mr-2 lg:w-[15.4rem] lg:bg-popover hidden lg:flex items-center px-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-9h10v2H7z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-foreground tracking-tight">BuzzU</span>
          </div>
        </div>
        <div className="flex flex-1 items-center px-4">
          <span className="text-md truncate font-bold normal-case cursor-pointer text-foreground">@Hooman</span>
        </div>
        <div className="flex items-center gap-1 md:gap-2 pr-4">
          <div data-orientation="vertical" role="none" className="shrink-0 bg-border w-[1px] h-4 self-center mx-2"></div>
          <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full relative" type="button" aria-label="Open friend requests">
            <Users className="h-[21px] w-[21px]" />
          </button>
          <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full relative" type="button" aria-label="Open notifications">
            <Bell className="h-[21px] w-[21px]" />
          </button>
          <button className="inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-10 w-10 rounded-full" type="button" aria-label="Open messages">
            <MessageCircle className="h-[21px] w-[21px] text-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
