import React, { useEffect, useRef, useState } from 'react';
import { XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Message } from './types';
import { EmojiPicker } from './EmojiPicker';

interface MessageInputProps {
  replyingTo: Message | null;
  editingMessage: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  connectionState: 'idle' | 'searching' | 'connected' | 'partner_skipped';
  onStart: () => void;
  onStop: () => void;
  onSkip: () => void;
  onSend: (content: string) => void;
  isPartnerTyping?: boolean;
  partnerName?: string;
}

export function MessageInput({
  replyingTo,
  editingMessage,
  onCancelReply,
  onCancelEdit,
  connectionState,
  onStart,
  onStop,
  onSkip,
  onSend,
  isPartnerTyping = false,
  partnerName = 'Stranger'
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const [skipState, setSkipState] = useState<'initial' | 'confirming'>('initial');
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);

  useEffect(() => {
    if (connectionState !== 'connected') {
      setSkipState('initial');
    }
  }, [connectionState]);

  useEffect(() => {
    if (editingMessage && textareaRef.current) {
      textareaRef.current.value = editingMessage.content;
      textareaRef.current.focus();
    }
  }, [editingMessage]);

  const handleSkipClick = () => {
    if (skipState === 'initial') {
      setSkipState('confirming');
    } else {
      onSkip();
      setSkipState('initial');
    }
  };

  const handleEmojiSelect = (emoji: any) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);

      textarea.value = before + emoji.native + after;
      textarea.selectionStart = textarea.selectionEnd = start + emoji.native.length;
      textarea.focus();
    }
    setIsEmojiPickerOpen(false);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = textareaRef.current?.value.trim();
    if (val && connectionState === 'connected') {
      onSend(val);
      if (textareaRef.current) {
        textareaRef.current.value = '';
        textareaRef.current.style.height = '44px';
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const val = textareaRef.current?.value.trim();
      if (val && connectionState === 'connected') {
        onSend(val);
        if (textareaRef.current) {
          textareaRef.current.value = '';
          textareaRef.current.style.height = '44px';
        }
      }
    }
  };

  return (
    <div className="relative flex w-full flex-row bg-popover">
      <div className="dmtextarea px-4 lg:px-7 mx-auto" style={{ width: '100%' }}>

        {/* Reply/Edit Banner (Matched to Screenshot) */}
        <AnimatePresence>
          {(replyingTo || editingMessage) && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute bottom-full left-4 lg:left-7 right-4 lg:right-7 bg-[#2b2d31] dark:bg-placeholder rounded-t-lg text-[13px] py-2 px-4 flex flex-row items-center justify-between z-20 mb-[1px]"
            >
              <div className="flex-1 truncate">
                <span className="text-[#dcdef3]/60 mr-1.5 font-medium">
                  {replyingTo ? 'Replying to' : 'Editing message for'}
                </span>
                <span className="font-bold text-white">
                  {replyingTo?.username || editingMessage?.username}
                </span>
              </div>
              <button
                onClick={replyingTo ? onCancelReply : onCancelEdit}
                className="ml-2 hover:opacity-80 transition-opacity"
              >
                <XCircle className="h-4 w-4 text-[#dcdef3]/40 hover:text-[#dcdef3]/80 fill-current" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex max-w-full flex-row gap-2.5 -mb-1">
          <span className="flex items-center self-end relative">
            <kbd className="hidden h-11 cursor-default items-center rounded-none rounded-l-lg border-y-2 border-l-2 border-primary-focus bg-panel px-1.5 lg:flex">
              ESC
            </kbd>
            <button
              onClick={
                connectionState === 'idle' || connectionState === 'partner_skipped' ? onStart :
                  connectionState === 'searching' ? onStop :
                    handleSkipClick
              }
              className={`inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-11 px-2 rounded-md lg:rounded-l-none ${connectionState === 'connected' || connectionState === 'partner_skipped'
                ? 'bg-warning text-warning-foreground hover:bg-warning/90'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                }`}
            >
              {connectionState === 'idle' || connectionState === 'partner_skipped' ? 'START' :
                connectionState === 'searching' ? 'STOP' :
                  (skipState === 'confirming' ? 'REALLY?' : 'SKIP')}
            </button>
          </span>

          <form className="flex w-full flex-col" onSubmit={handleFormSubmit}>
            <div className="flex flex-row gap-1.5">
              <div className="textarea overflow-auto rounded-lg relative flex w-full flex-row h-full items-center gap-1 bg-card dark:bg-placeholder py-0 px-2 outline-none">
                <input className="hidden" accept="image/png,image/jpg,image/jpeg,image/webp,video/mp4,video/webm,video/mov" type="file" name="media" />

                {/* Reference Image Button */}
                <button type="button" className="self-center text-zinc-600 dark:text-inherit hover:text-zinc-700 dark:hover:text-current p-1 disabled:opacity-50" disabled={connectionState !== 'connected'}>
                  <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 16 16" className="h-5 w-5" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4.502 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"></path>
                    <path d="M14.002 13a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5A2 2 0 0 1 2 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-1.998 2M14 2H4a1 1 0 0 0-1 1h9.002a2 2 0 0 1 2 2v7A1 1 0 0 0 15 11V3a1 1 0 0 0-1-1M2.002 4a1 1 0 0 0-1 1v8l2.646-2.354a.5.5 0 0 1 .63-.062l2.66 1.773 3.71-3.71a.5.5 0 0 1 .577-.094l1.777 1.947V5a1 1 0 0 0-1-1z"></path>
                  </svg>
                </button>

                <textarea
                  ref={textareaRef}
                  placeholder={connectionState !== 'connected' ? 'Click START to chat...' : (editingMessage ? 'Edit message' : 'Send a message')}
                  aria-label="Send a message"
                  maxLength={2000}
                  rows={1}
                  disabled={connectionState !== 'connected'}
                  onKeyDown={handleKeyDown}
                  className="max-h-28 text-sm px-1 py-3 outline-none lg:max-h-96 bg-inherit resize-none w-full scrollbar-t placeholder:truncate placeholder:text-placeholder-foreground/80 dark:placeholder:text-placeholder-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed fixed-input-height"
                  name="message"
                />

                {/* Reference GIF Button */}
                <button type="button" className="p-1 disabled:opacity-50" disabled={connectionState !== 'connected'}>
                  <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 256 256" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition mr-2" height="24" width="24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM112,144a32,32,0,0,1-64,0V112a32,32,0,0,1,55.85-21.33,8,8,0,1,1-11.92,10.66A16,16,0,0,0,64,112v32a16,16,0,0,0,32,0v-8H88a8,8,0,0,1,0-16h16a8,8,0,0,1,8,8Zm32,24a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Zm60-72H176v24h20a8,8,0,0,1,0,16H176v32a8,8,0,0,1-16,0V88a8,8,0,0,1,8-8h36a8,8,0,0,1,0,16Z"></path>
                  </svg>
                </button>

                {/* Emoji Button — toggle only, picker renders outside overflow-auto */}
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                  className="p-1 disabled:opacity-50"
                  disabled={connectionState !== 'connected'}
                >
                  <svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 496 512" className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                    <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm80 168c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm-160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm194.8 170.2C334.3 380.4 292.5 400 248 400s-86.3-19.6-114.8-53.8c-13.6-16.3 11-36.7 24.6-20.5 22.4 26.9 55.2 42.2 90.2 42.2s67.8-15.4 90.2-42.2c13.4-16.2 38.1 4.2 24.6 20.5z"></path>
                  </svg>
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* EmojiPicker — MUST live outside overflow-auto textarea so it isn't clipped */}
        <EmojiPicker
          isOpen={isEmojiPickerOpen}
          onClose={() => setIsEmojiPickerOpen(false)}
          onEmojiSelect={handleEmojiSelect}
          anchorRef={emojiButtonRef}
        />
        {/* Typing indicator — fixed height so no jumping */}
        <div className="h-7 flex items-center">
          <AnimatePresence>
            {isPartnerTyping && (
              <motion.div
                key="typing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-row gap-2 items-center px-1"
              >
                <div className="flex items-center gap-1">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </div>
                <div className="text-xs text-muted-foreground">
                  <strong className="text-foreground">{partnerName}</strong> is typing...
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
