import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown } from 'lucide-react';
import { Message } from './types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: Message | null;
}

const REASONS = [
  'Spam or advertising',
  'Illegal or violent content',
  'Harassment or hate speech',
  'Hacking or scamming',
  'Underage (-18)',
  'Other'
];

export function ReportModal({ isOpen, onClose, message }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  if (!isOpen || !message) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm shadow-black drop-shadow-2xl"
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="fixed left-[50%] sm:top-[50%] max-sm:bottom-4 z-[70] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] gap-4 border bg-background p-6 shadow-lg sm:max-w-lg sm:translate-y-[-50%] sm:rounded-lg rounded-xl select-text max-h-[85dvh] flex flex-col"
        tabIndex={-1}
        style={{ pointerEvents: 'auto' }}
      >
        <div className="flex flex-col space-y-1.5 text-center sm:text-left mb-2">
          <h2 className="text-lg font-semibold leading-none tracking-tight text-foreground">Report Message</h2>
          <p className="text-sm text-muted-foreground pt-1">Please select the reason that best describes your problem.</p>
        </div>

        {/* Message Preview Box */}
        <div className="bg-popover outline outline-1 outline-destructive/60 pb-2.5 rounded-lg overflow-y-auto min-h-0 mb-4">
          <div className="pointer-events-none opacity-80 scale-95 origin-top">
            <div className="pt-4">
              <div className="group relative flex w-full items-start pl-14 pr-4 md:pl-16">
                {/* Avatar */}
                <div className="absolute left-0 top-0 flex h-full">
                  <div className="absolute z-0 left-2 w-10 select-none overflow-hidden pt-0.5">
                    <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                      <img
                        className="aspect-square h-full w-full"
                        alt={message.username}
                        src={`https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${message.avatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`}
                      />
                    </span>
                  </div>
                </div>

                <div className="w-full flex flex-col items-start">
                  <h3 className="min-h-5 relative block w-auto overflow-hidden whitespace-break-spaces leading-snug">
                    <span className="mr-1 inline-flex flex-row items-center justify-center gap-1">
                      <span className="relative inline overflow-hidden align-baseline text-base leading-none text-foreground sm:leading-snug font-bold">
                        {message.username}
                      </span>
                    </span>
                    <time className="text-zinc-500 text-xs leading-snug tracking-tight align-baseline font-medium ml-1">
                      {message.timestamp}
                    </time>
                  </h3>
                  <div className="leading w-full flex-1">
                    <p className="-ml-16 select-text pl-16 leading-snug sm:leading-normal whitespace-pre-line break-words dark:text-message" style={{ wordBreak: 'break-word' }}>
                      {message.content}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Reason Select */}
        <div className="relative mb-4">
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 bg-popover"
          >
            <span className={selectedReason ? 'text-foreground' : 'text-muted-foreground'}>
              {selectedReason || 'Select reason'}
            </span>
            <ChevronDown className={`h-4 w-4 opacity-50 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isDropdownOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute bottom-full left-0 right-0 mb-1 z-[80] rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95 overflow-hidden"
              >
                <div className="p-1 max-h-48 overflow-y-auto">
                  {REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => {
                        setSelectedReason(reason);
                        setIsDropdownOpen(false);
                      }}
                      className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col-reverse max-md:gap-3 sm:flex-row sm:justify-end sm:space-x-2 pt-2">
          <button
            onClick={onClose}
            className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2"
          >
            Cancel
          </button>
          <button
            disabled={!selectedReason}
            className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
          >
            Report
          </button>
        </div>

        {/* Close Button Trigger */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </motion.div>
    </div>
  );
}
