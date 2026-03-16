import { useState, useCallback } from "react";
import { GemIcon, HistoryIcon, UserIcon, CloseIcon } from "./icons";
import { UserMenu } from "./user-menu";

interface HeaderNavProps {
  isSearching?: boolean;
  isMatched?: boolean;
  onEndChat?: () => void;
  onMore?: () => void;
}

export function HeaderNav({ isSearching, isMatched, onEndChat, onMore }: HeaderNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  if (isSearching || isMatched) {
    return (
      <div className="top-0 absolute w-full z-40 flex items-center justify-between px-3.5 py-2.5 lg:px-5 lg:py-4">
        {/* Empty left side */}
        <div className="hidden lg:block" />

        {/* Right side buttons */}
        <div className="flex items-center gap-2 flex-row justify-end">
          {/* History button - collapsed */}
          <button className="cursor-pointer items-center justify-center text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 px-3 rounded-full md:rounded-3xl text-white font-bold gap-1.5 bg-black/30 hover:bg-black/40 hidden lg:flex">
            <HistoryIcon />
            <span className="overflow-hidden transition-all duration-300 max-w-0 ml-0 opacity-0 hidden">
              History
            </span>
          </button>

          {/* End Chat button */}
          <button
            onClick={onEndChat}
            title="End Chat"
            aria-label="End chat"
            className="inline-flex cursor-pointer items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 rounded-full text-white/80 hover:text-white hover:bg-black/10 p-0 max-lg:h-[50px] !size-10"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="top-0 absolute w-full z-40 flex items-center justify-end px-3.5 py-2.5 lg:px-5 lg:py-4">


      {/* Right side buttons */}
      <div className="flex items-center gap-2 flex-row justify-end">
        {/* History button - desktop */}
        <button className="cursor-pointer items-center justify-center text-sm ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 h-9 px-3 rounded-full md:rounded-3xl text-white font-bold gap-1.5 bg-black/30 hover:bg-black/40 hidden lg:flex">
          <HistoryIcon />
          <span className="overflow-hidden transition-all duration-300 max-w-[100px] opacity-100 !block">
            History
          </span>
        </button>

        {/* Profile menu button */}
        <div
          role="menubar"
          className="flex items-center space-x-1 border bg-background shadow-xs border-none rounded-full p-0 size-auto relative"
          tabIndex={0}
        >
          <button
            className="justify-center ring-offset-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 flex select-none items-center text-sm font-medium outline-hidden focus:bg-accent focus:text-accent-foreground rounded-full size-10 p-0 cursor-pointer"
            type="button"
            role="menuitem"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <UserIcon />
          </button>

          {/* Dropdown menu */}
          <UserMenu open={menuOpen} onClose={closeMenu} onMore={onMore} />
        </div>
      </div>
    </div>
  );
}
