import React from 'react';
import { HistoryIcon, StarIllustration } from './Icons';

interface RightSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const RightSidebar: React.FC<RightSidebarProps> = ({ isOpen, onClose }) => {
  return (
    <>
      {/* Overlay */}
      <div
        className={`absolute inset-0 z-10 bg-opacity-30 transition-opacity duration-300 ease-in-out lg:hidden pointer-events-none ${isOpen ? 'opacity-100 pointer-events-auto bg-black' : 'opacity-0'}`}
        tabIndex={-1}
        onClick={onClose}
      ></div>

      {/* Right Sidebar */}
      <div
        dir="ltr"
        className={`fixed inset-y-0 right-0 z-30 h-full w-64 bg-popover transition-transform duration-300 ease-in-out transform border-l border-border/10 ${isOpen ? 'translate-x-0 shadow-xl' : 'translate-x-full'}`}
        tabIndex={-1}
        style={{ position: 'absolute', '--radix-scroll-area-corner-width': '0px', '--radix-scroll-area-corner-height': '0px' } as React.CSSProperties}
      >
        <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
          <div style={{ minWidth: '100%', display: 'table' }}>
            <ul className="h-full w-64 overflow-y-hidden px-1 pt-1">
              <div dir="ltr" className="relative overflow-hidden w-full px-2" tabIndex={-1} style={{ position: 'relative', '--radix-scroll-area-corner-width': '0px', '--radix-scroll-area-corner-height': '0px' } as React.CSSProperties}>
                <div data-radix-scroll-area-viewport="" className="h-full w-full rounded-[inherit]" style={{ overflow: 'hidden scroll' }}>
                  <div style={{ minWidth: '100%', display: 'table' }}>
                    <span className="mt-2 flex flex-row items-center justify-center gap-1 self-center text-center text-sm font-bold sm:mt-3">
                      <HistoryIcon className="h-4 w-4" />
                      MATCH HISTORY
                    </span>
                    <div data-orientation="horizontal" role="none" className="shrink-0 bg-border h-[1px] w-full divider my-3"></div>
                    <div className="mt-6 flex flex-col items-center justify-center opacity-[var(--empty-state-opacity)] grayscale">
                      <StarIllustration />
                      <p className="mt-4 text-center text-sm">No matches yet! Once you match and chat with someone, you'll see the chat history here.</p>
                    </div>
                  </div>
                </div>
              </div>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default RightSidebar;

