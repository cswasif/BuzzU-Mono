import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Smile,
  Paperclip,
  X,
  RotateCcw,
  Reply,
  Edit3,
  Image as ImageIcon,
  FileImage,
  EyeOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Message } from "./types";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { EmojiPicker } from "./EmojiPicker";
import { GifPicker } from "./GifPicker";
// IGif import removed because we are switching to Klipy

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

interface MessageInputProps {
  replyingTo: Message | null;
  editingMessage: Message | null;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  connectionState:
  | "idle"
  | "setup"
  | "searching"
  | "connecting"
  | "connected"
  | "partner_skipped"
  | "self_skipped"
  | "waiting";
  onStart: () => void;
  onStop: () => void;
  onSkip: () => void;
  onSend: (content: string, replyToMessage?: Message | null) => void;
  isPartnerTyping?: boolean;
  partnerName?: string;
  onTyping: (isTyping: boolean) => void;
  onSelectFiles: (files: File[]) => void;
  isGifPickerOpen: boolean;
  onToggleGifPicker?: () => void;
  onCloseGifPicker?: () => void;
  isVanishMode?: boolean;
  onToggleVanishMode?: () => void;
  isDmMode?: boolean;
  isDirectConnectMode?: boolean;
  isCompactGifPicker?: boolean;
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
  partnerName = "Stranger",
  onTyping,
  onSelectFiles,
  isGifPickerOpen = false,
  onToggleGifPicker,
  onCloseGifPicker,
  isVanishMode = false,
  onToggleVanishMode,
  isDmMode = false,
  isDirectConnectMode = false,
  isCompactGifPicker = false,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const gifButtonRef = useRef<HTMLButtonElement>(null);
  const [skipState, setSkipState] = useState<"initial" | "confirming">(
    "initial",
  );
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTypingState = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (onTyping) onTyping(false);
  };

  useEffect(() => {
    if (connectionState !== "connected") {
      setSkipState("initial");
    }
  }, [connectionState]);

  useEffect(() => {
    if (editingMessage && textareaRef.current) {
      textareaRef.current.value = editingMessage.content;
      textareaRef.current.focus();
      // Trigger resize so multi-line edit content expands the box
      textareaRef.current.style.height = "auto";
      const maxH = window.innerWidth >= 1024 ? 384 : 112;
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, maxH)}px`;
    }
  }, [editingMessage]);

  useEffect(() => {
    if (!replyingTo || connectionState !== "connected") return;
    const focusInput = () => {
      const input = textareaRef.current;
      if (!input) return;
      try {
        input.focus({ preventScroll: true } as any);
      } catch {
        input.focus();
      }
      const len = input.value.length;
      try {
        input.setSelectionRange(len, len);
      } catch { }
    };
    const frame = requestAnimationFrame(() => focusInput());
    const timer = setTimeout(() => focusInput(), 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [replyingTo, connectionState]);

  const handleSkipClick = () => {
    if (skipState === "initial") {
      setSkipState("confirming");
    } else {
      onSkip();
      setSkipState("initial");
    }
  };

  // Auto-reset confirming state after 3 seconds
  const confirmTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (skipState === "confirming") {
      confirmTimeoutRef.current = setTimeout(
        () => setSkipState("initial"),
        3000,
      );
    }
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    };
  }, [skipState]);

  // Global ESC key handler — drives the entire state machine
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();

      if (
        connectionState === "idle" ||
        connectionState === "partner_skipped" ||
        connectionState === "self_skipped"
      ) {
        onStart();
      } else if (connectionState === "searching") {
        onStop();
      } else if (connectionState === "connected") {
        handleSkipClick();
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [connectionState, skipState, onStart, onStop]); // handleSkipClick is stable via closure

  const handleEmojiSelect = (emoji: any) => {
    if (textareaRef.current) {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = textarea.value;
      const before = text.substring(0, start);
      const after = text.substring(end);

      textarea.value = before + emoji.native + after;
      textarea.selectionStart = textarea.selectionEnd =
        start + emoji.native.length;
      textarea.focus();
    }
    setIsEmojiPickerOpen(false);
  };

  const handleGifSelect = useCallback(
    (gif: any) => {
      // Klipy GifImage object has a direct 'url' property for the full GIF
      const gifUrl = gif.url;
      onSend(`![gif](${gifUrl})`, replyingTo);
      onCloseGifPicker();
      onTyping(false);
    },
    [onSend, replyingTo, onCloseGifPicker, onTyping],
  );

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = textareaRef.current?.value.trim();
    if (val && connectionState === "connected") {
      onSend(val, replyingTo);
      clearTypingState();
      if (textareaRef.current) {
        textareaRef.current.value = "";
        // Reset to single-row height after send
        textareaRef.current.style.height = "auto";
        textareaRef.current.style.height = "44px";
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      // Plain Enter → send message
      e.preventDefault();
      const val = textareaRef.current?.value.trim();
      if (val && connectionState === "connected") {
        onSend(val, replyingTo);
        clearTypingState();
        if (textareaRef.current) {
          textareaRef.current.value = "";
          // Reset to single-row height after send
          textareaRef.current.style.height = "auto";
          textareaRef.current.style.height = "44px";
        }
      }
    }
    // Shift+Enter → browser inserts a newline; handleInputChange will resize
  };

  const handleInputChange = () => {
    // Auto-resize textarea to fit content (enables proper Shift+Enter multiline)
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset to auto so scrollHeight reflects actual content height
      textarea.style.height = "auto";
      // Cap at Tailwind's max-h-28 (112px) on mobile, max-h-96 (384px) on lg+
      const maxH = window.innerWidth >= 1024 ? 384 : 112;
      textarea.style.height = `${Math.min(textarea.scrollHeight, maxH)}px`;
    }

    if (connectionState === "connected" && onTyping) {
      onTyping(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        onTyping(false);
      }, 2000);
    }
  };

  return (
    <div className="relative flex w-full flex-row bg-popover">
      <div
        className="dmtextarea px-4 lg:px-7 mx-auto"
        style={{ width: "100%" }}
      >
        {/* Reply/Edit Banner */}
        <AnimatePresence>
          {(replyingTo || editingMessage) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="bg-card w-full rounded-t-md text-sm py-2.5 px-4 flex flex-row items-center justify-between"
            >
              <div className="flex-1 truncate">
                <div className="font-normal">
                  {replyingTo ? "Replying to " : "Editing message for "}
                  <span className="font-bold">
                    {replyingTo?.username || editingMessage?.username}
                  </span>
                </div>
              </div>
              <button
                onClick={replyingTo ? onCancelReply : onCancelEdit}
                className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground ml-2 h-5 w-5 flex-shrink-0"
                aria-label={replyingTo ? "Cancel reply" : "Cancel edit"}
              >
                <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 20 20" aria-hidden="true" height="20" width="20" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path>
                </svg>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex max-w-full flex-row gap-2.5 -mb-1">
          {!isDmMode && !isDirectConnectMode && (
            <span className="flex items-center self-end relative flex-none z-10">
              <kbd className="hidden h-11 cursor-default items-center rounded-none rounded-l-lg border-y-2 border-l-2 border-primary-focus bg-panel px-1.5 lg:flex">
                ESC
              </kbd>
              <button
                type="button"
                onClick={
                  connectionState === "idle" ||
                    connectionState === "partner_skipped" ||
                    connectionState === "self_skipped"
                    ? onStart
                    : connectionState === "searching"
                      ? onStop
                      : handleSkipClick
                }
                className={`inline-flex disabled:select-none items-center justify-center text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-11 px-2 rounded-md lg:rounded-l-none ${connectionState === "connected" ||
                    connectionState === "partner_skipped" ||
                    connectionState === "self_skipped"
                    ? "bg-warning text-warning-foreground hover:bg-warning/90 shadow"
                    : "bg-primary text-primary-foreground hover:bg-primary/90 shadow"
                  }`}
                aria-label={connectionState === "searching" ? "Stop searching" : connectionState === "connected" ? "Skip current chat" : "Start chat"}
                aria-busy={connectionState === "searching" || undefined}
              >
                {connectionState === "idle" ||
                  connectionState === "partner_skipped" ||
                  connectionState === "self_skipped"
                  ? "START"
                  : connectionState === "searching"
                    ? "STOP"
                    : skipState === "confirming"
                      ? "CONFIRM?"
                      : "SKIP"}
              </button>
            </span>
          )}

          <form
            className="flex flex-1 min-w-0 flex-col relative z-20"
            onSubmit={handleFormSubmit}
          >
            <div className="flex flex-row gap-1.5">
              <div className="textarea flex-1 overflow-auto rounded-lg relative flex flex-row h-full items-center gap-1 bg-card dark:bg-placeholder py-0 px-2 outline-none">
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpg,image/jpeg,image/webp"
                  className="hidden"
                  id="image-upload"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0 && onSelectFiles) onSelectFiles(files);
                    e.target.value = ""; // Reset for same file selection
                  }}
                />

                {/* Reference Image Button */}
                <button
                  type="button"
                  className="self-center text-zinc-600 dark:text-inherit hover:text-zinc-700 dark:hover:text-current p-1 disabled:opacity-50"
                  disabled={connectionState !== "connected"}
                  aria-label="Attach image"
                  onClick={() =>
                    document.getElementById("image-upload")?.click()
                  }
                >
                  <svg
                    stroke="currentColor"
                    fill="currentColor"
                    strokeWidth="0"
                    viewBox="0 0 16 16"
                    className="h-5 w-5"
                    height="1em"
                    width="1em"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M4.502 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3"></path>
                    <path d="M14.002 13a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V5A2 2 0 0 1 2 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-1.998 2M14 2H4a1 1 0 0 0-1 1h9.002a2 2 0 0 1 2 2v7A1 1 0 0 0 15 11V3a1 1 0 0 0-1-1M2.002 4a1 1 0 0 0-1 1v8l2.646-2.354a.5.5 0 0 1 .63-.062l2.66 1.773 3.71-3.71a.5.5 0 0 1 .577-.094l1.777 1.947V5a1 1 0 0 0-1-1z"></path>
                  </svg>
                </button>

                {onToggleVanishMode && (
                  <button
                    type="button"
                    className={cn(
                      "self-center p-1.5 rounded-md transition-colors disabled:opacity-50",
                      isVanishMode
                        ? "text-warning bg-warning/15 hover:bg-warning/20"
                        : "text-zinc-600 dark:text-inherit hover:text-zinc-700 dark:hover:text-current hover:bg-accent/40",
                    )}
                    disabled={connectionState !== "connected"}
                    aria-label={
                      isVanishMode
                        ? "Disable one-time image mode"
                        : "Enable one-time image mode"
                    }
                    onClick={onToggleVanishMode}
                    title={isVanishMode ? "One-time image mode on" : "One-time image mode off"}
                  >
                    <span className="flex items-center gap-1">
                      <EyeOff className="h-4 w-4" />
                      <span className="text-[10px] font-bold leading-none">1x</span>
                    </span>
                  </button>
                )}

                <textarea
                  ref={textareaRef}
                  placeholder={
                    connectionState !== "connected"
                      ? "Click START to chat..."
                      : editingMessage
                        ? "Edit message"
                        : "Send a message"
                  }
                  aria-label="Send a message"
                  maxLength={2000}
                  rows={1}
                  disabled={connectionState !== "connected"}
                  onKeyDown={handleKeyDown}
                  onChange={handleInputChange}
                  className="max-h-28 text-base md:text-sm px-1 py-3 outline-none lg:max-h-96 bg-inherit resize-none w-full scrollbar-t placeholder:truncate placeholder:text-placeholder-foreground/80 dark:placeholder:text-placeholder-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed fixed-input-height"
                  name="message"
                />

                {/* GIF Button */}
                <button
                  ref={gifButtonRef}
                  type="button"
                  onClick={onToggleGifPicker}
                  className={cn(
                    "p-2 hover:bg-accent rounded-full transition-colors",
                    isGifPickerOpen && "text-primary bg-accent",
                  )}
                  title="GIPHY GIFs"
                  aria-label={isGifPickerOpen ? "Close GIF picker" : "Open GIF picker"}
                  disabled={connectionState !== "connected"}
                >
                  <svg
                    stroke="currentColor"
                    fill="currentColor"
                    strokeWidth="0"
                    viewBox="0 0 256 256"
                    className="w-[1.125rem] h-[1.125rem]"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M216,40H40A16,16,0,0,0,24,56V200a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V56A16,16,0,0,0,216,40ZM112,144a32,32,0,0,1-64,0V112a32,32,0,0,1,55.85-21.33,8,8,0,1,1-11.92,10.66A16,16,0,0,0,64,112v32a16,16,0,0,0,32,0v-8H88a8,8,0,0,1,0-16h16a8,8,0,0,1,8,8Zm32,24a8,8,0,0,1-16,0V88a8,8,0,0,1,16,0Zm60-72H176v24h20a8,8,0,0,1,0,16H176v32a8,8,0,0,1-16,0V88a8,8,0,0,1,8-8h36a8,8,0,0,1,0,16Z"></path>
                  </svg>
                </button>

                {/* Emoji Button — toggle only, picker renders outside overflow-auto */}
                <button
                  ref={emojiButtonRef}
                  type="button"
                  onClick={() => setIsEmojiPickerOpen(!isEmojiPickerOpen)}
                  className="p-1 disabled:opacity-50"
                  aria-label={isEmojiPickerOpen ? "Close emoji picker" : "Open emoji picker"}
                  disabled={connectionState !== "connected"}
                >
                  <svg
                    stroke="currentColor"
                    fill="currentColor"
                    strokeWidth="0"
                    viewBox="0 0 496 512"
                    className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition"
                    height="20"
                    width="20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M248 8C111 8 0 119 0 256s111 248 248 248 248-111 248-248S385 8 248 8zm80 168c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm-160 0c17.7 0 32 14.3 32 32s-14.3 32-32 32-32-14.3-32-32 14.3-32 32-32zm194.8 170.2C334.3 380.4 292.5 400 248 400s-86.3-19.6-114.8-53.8c-13.6-16.3 11-36.7 24.6-20.5 22.4 26.9 55.2 42.2 90.2 42.2s67.8-15.4 90.2-42.2c13.4-16.2 38.1 4.2 24.6 20.5z"></path>
                  </svg>
                </button>
              </div>
            </div>
            <span className="sr-only" role="status" aria-live="polite">
              {connectionState === "searching"
                ? "Searching for a partner"
                : connectionState === "connecting"
                  ? "Connecting to partner"
                  : connectionState === "connected"
                    ? "Connected"
                    : "Idle"}
            </span>
          </form>
        </div>

        {/* EmojiPicker — MUST live outside overflow-auto textarea so it isn't clipped */}
        <EmojiPicker
          isOpen={isEmojiPickerOpen}
          onClose={() => setIsEmojiPickerOpen(false)}
          onEmojiSelect={handleEmojiSelect}
          anchorRef={emojiButtonRef}
        />
        {/* Floating GIF Picker (for mobile/small screens or when not using docked mode) */}
        {!editingMessage && isGifPickerOpen && (
          <GifPicker
            isOpen={isGifPickerOpen}
            onClose={onCloseGifPicker || (() => { })}
            onGifSelect={handleGifSelect}
            variant="floating"
            anchorRef={gifButtonRef}
            compact={isCompactGifPicker}
          />
        )}
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
                  <strong className="text-foreground">{partnerName}</strong> is
                  typing...
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
