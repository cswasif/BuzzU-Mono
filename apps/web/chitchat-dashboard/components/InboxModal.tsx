import React from 'react';
import { InboxIcon, SolidCheckCircleIcon } from './Icons';

interface InboxModalProps {
  onClose: () => void;
}

const InboxModal: React.FC<InboxModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-transparent" onClick={onClose}>
      <div
        className="absolute top-[56px] right-4 z-50 w-72 bg-popover text-popover-foreground outline-none rounded-md border border-border mt-3 p-0 shadow-lg xs:w-72 sm:w-80 drop-shadow-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="flex w-full flex-row items-center gap-2 rounded-t-lg bg-muted px-4 py-4 text-lg font-bold">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="22" width="22" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M5 3a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2V5a2 2 0 00-2-2H5zm0 2h10v7h-2l-1 2H8l-1-2H5V5z" clip-rule="evenodd"></path>
          </svg>
          Inbox
        </span>
        <div className="rounded-b-box flex flex-row items-center justify-center px-4 py-9 gap-2">
          <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
            <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path>
          </svg>
          <span className="text-base">No notifications</span>
        </div>
      </div>
    </div>
  );
};

export default InboxModal;
