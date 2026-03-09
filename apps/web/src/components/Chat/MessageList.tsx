import React, { useRef, useEffect, useMemo } from 'react';
import { MessageItem } from './MessageItem';
import { ImageGrid } from './ImageGrid';
import { Message } from './types';
import { ShieldCheck } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';

interface MessageListProps {
  messages: Message[];
  partnerName: string;
  onReply: (message: Message) => void;
  onEdit: (message: Message) => void;
  onReport: (message: Message) => void;
  onDelete: (message: Message) => void;
  highlightedMessageId?: string | null;
  editingMessageId?: string | null;
  onSaveEdit?: (id: string, newContent: string) => void;
  onCancelEdit?: () => void;
  onProfileClick?: (username: string, avatarSeed: string, avatarUrl?: string | null, isVerified?: boolean) => void;
  partnerIsVerified?: boolean;
  isSignalReady?: boolean;
  isCryptoReady?: boolean;
  onVanishOpen?: (messageId: string) => void;
  hideIntro?: boolean;
}

type GroupedItem =
  | { kind: 'message'; message: Message }
  | { kind: 'image-group'; messages: Message[]; username: string; avatarSeed: string; avatarUrl?: string | null; timestamp: string; isVerified?: boolean };

function isImageMessage(msg: Message): boolean {
  return msg.content.startsWith('![image]');
}

function groupMessages(messages: Message[]): GroupedItem[] {
  const result: GroupedItem[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (isImageMessage(msg) && msg.type !== 'system') {
      // Collect consecutive images from the same user
      const batch: Message[] = [msg];
      let j = i + 1;
      while (j < messages.length && isImageMessage(messages[j]) && messages[j].username === msg.username && messages[j].type !== 'system') {
        batch.push(messages[j]);
        j++;
      }
      result.push({
        kind: 'image-group',
        messages: batch,
        username: msg.username,
        avatarSeed: msg.avatarSeed || '',
        avatarUrl: msg.avatarUrl || null,
        timestamp: msg.timestamp,
        isVerified: msg.isVerified,
      });
      i = j;
    } else {
      result.push({ kind: 'message', message: msg });
      i++;
    }
  }
  return result;
}

export function MessageList({
  messages,
  partnerName,
  onReply,
  onEdit,
  onReport,
  onDelete,
  highlightedMessageId,
  editingMessageId,
  onSaveEdit,
  onCancelEdit,
  onProfileClick,
  partnerIsVerified,
  isSignalReady = false,
  isCryptoReady = false,
  hideIntro = false
}: MessageListProps) {
  const selfAvatarUrl = useSessionStore(state => state.avatarUrl);
  const selfAvatarSeed = useSessionStore(state => state.avatarSeed);
  const storePartnerName = useSessionStore(state => state.partnerName);
  const storePartnerAvatarUrl = useSessionStore(state => state.partnerAvatarUrl);
  const storePartnerAvatarSeed = useSessionStore(state => state.partnerAvatarSeed);
  const containerRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const el = containerRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages]);

  const grouped = useMemo(() => groupMessages(messages), [messages]);

  return (
    <ol ref={containerRef} className="overflow-y-auto overflow-x-hidden w-full chat-scrollbar h-full flex-grow flex-1 min-h-0 flex flex-col overscroll-none pb-4 mb-3" style={{ scrollBehavior: 'smooth' }}>
      <div className="flex-grow"></div>
      {!hideIntro && <div className="mx-4 mb-2">
        <span className="text-start text-foreground inline-flex items-center gap-1.5 flex-wrap">
          You are now chatting with <span className="text-emerald-400 font-bold cursor-pointer inline-flex items-center gap-1" onClick={() => {
            const effectiveName = partnerName || storePartnerName || 'Partner';
            const effectiveSeed = storePartnerAvatarSeed || effectiveName;
            const effectiveUrl = storePartnerAvatarUrl || null;
            onProfileClick?.(effectiveName, effectiveSeed, effectiveUrl, partnerIsVerified);
          }}>
            {partnerName}
            {partnerIsVerified && <ShieldCheck className="h-4 w-4 text-blue-500 fill-blue-500/10" />}
          </span>. Say hi!
        </span>
        {isSignalReady ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span className="text-green-500 font-medium">Messages End-to-End Encrypted</span>
          </div>
        ) : isCryptoReady ? (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5 text-yellow-500 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-yellow-500">Establishing encrypted connection...</span>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <svg className="w-3.5 h-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="text-red-500">Encryption not available - messages sent as plaintext</span>
          </div>
        )}
      </div>}
      {grouped.map((item) => {
        if (item.kind === 'message') {
          return (
            <MessageItem
              key={item.message.id}
              message={item.message}
              onReply={onReply}
              onEdit={onEdit}
              onReport={onReport}
              onDelete={onDelete}
              isHighlighted={item.message.id === highlightedMessageId}
              isEditingInline={item.message.id === editingMessageId}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onProfileClick={(username, avatarSeed, avatarUrl) => onProfileClick?.(username, avatarSeed, avatarUrl, item.message.isVerified)}
            />
          );
        }

        // Image group — render with grid under a single avatar+header
        const firstMsg = item.messages[0];
        const isOwn = item.username === 'Me';
        const resolvedAvatarUrl = isOwn
          ? (selfAvatarUrl || item.avatarUrl || null)
          : (item.username === (storePartnerName || partnerName) ? (storePartnerAvatarUrl || item.avatarUrl || null) : (item.avatarUrl || null));
        const resolvedAvatarSeed = isOwn ? (selfAvatarSeed || item.avatarSeed) : item.avatarSeed;
        return (
          <li key={`img-group-${firstMsg.id}`} className="select-text list-none">
            <div className="pt-4">
              <div className={`group relative flex w-full items-start pl-14 pr-4 chat-message-item md:pl-16 cursor-default ${item.username === 'Me' ? 'msg-own' : 'msg-partner'}`}>
                {/* Avatar */}
                <div className="absolute left-0 top-0 flex h-full">
                  <div
                    className="absolute z-0 left-2 w-10 select-none overflow-hidden pt-0.5 hover:cursor-pointer"
                    onClick={() => onProfileClick?.(item.username, resolvedAvatarSeed, resolvedAvatarUrl, item.isVerified)}
                  >
                    <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                      <img
                        className="aspect-square h-full w-full"
                        alt={item.username}
                        src={resolvedAvatarUrl || `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${resolvedAvatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`}
                      />
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="w-full flex flex-col items-start min-h-[40px]">
                  <h3 className="min-h-5 relative block w-auto overflow-hidden whitespace-break-spaces leading-snug">
                    <span className="mr-1 inline-flex flex-row items-center justify-center gap-1">
                      <span
                        className="relative inline align-baseline text-base leading-none sm:leading-snug font-bold cursor-pointer chat-username break-all break-words max-w-[150px] sm:max-w-xs truncate"
                        role="button"
                        tabIndex={0}
                        onClick={() => onProfileClick?.(item.username, resolvedAvatarSeed, resolvedAvatarUrl, item.isVerified)}
                      >
                        {item.username}
                      </span>
                      {item.isVerified && <ShieldCheck className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 inline-block align-middle ml-1" />}
                    </span>
                    <time className="text-zinc-500 text-xs leading-snug tracking-tight align-baseline font-medium cursor-default select-none ml-1">
                      {item.timestamp}
                    </time>
                  </h3>
                  <div className="leading w-full flex-1">
                    <div className="-ml-16 select-text pl-16 leading-snug sm:leading-normal whitespace-pre-wrap break-words break-all max-md:select-none chat-message-text mt-0.5">
                      <ImageGrid messages={item.messages} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}



