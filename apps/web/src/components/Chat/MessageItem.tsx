import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Reply, Trash2, MoreVertical, ArrowLeft, CheckCircle, Pencil, Flag, Copy, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Message } from './types';
import { createPortal } from 'react-dom';
import { ModernImage } from './ModernImage';
import { useSessionStore } from '../../stores/sessionStore';

interface MessageItemProps {
  message: Message;
  onReply?: (message: Message) => void;
  onEdit?: (message: Message) => void;
  onReport?: (message: Message) => void;
  onDelete?: (message: Message) => void;
  isHighlighted?: boolean;
  isEditingInline?: boolean;
  onSaveEdit?: (id: string, newContent: string) => void;
  onCancelEdit?: () => void;
  onProfileClick?: (username: string, avatarSeed: string, avatarUrl?: string | null) => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

function hashToHue(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) % 360;
  }
  return Math.abs(hash) % 360;
}

function buildFallbackAvatar(seed: string, label: string) {
  const initial = (label || seed || '?').trim().charAt(0).toUpperCase() || '?';
  const hue = hashToHue(seed || label || '');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="100%" height="100%" fill="hsl(${hue},65%,55%)"/><text x="50%" y="50%" font-size="40" font-family="Arial, sans-serif" fill="#fff" text-anchor="middle" dominant-baseline="middle">${initial}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onReply,
  onEdit,
  onReport,
  onDelete,
  isHighlighted,
  isEditingInline = false,
  onSaveEdit,
  onCancelEdit,
  onProfileClick
}) => {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const [isMobileThreeDotsVisible, setIsMobileThreeDotsVisible] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { username, avatarSeed, avatarUrl, timestamp, content, type = 'message', systemType, isVerified } = message;
  const isOwn = username === 'Me';
  const currentAvatarUrl = useSessionStore(state => state.avatarUrl);
  const currentAvatarSeed = useSessionStore(state => state.avatarSeed);
  const partnerName = useSessionStore(state => state.partnerName);
  const partnerAvatarUrl = useSessionStore(state => state.partnerAvatarUrl);
  const resolvedAvatarSeed = isOwn ? (currentAvatarSeed || avatarSeed) : avatarSeed;
  const resolvedAvatarUrl = isOwn
    ? (currentAvatarUrl || avatarUrl || null)
    : (username === partnerName ? (partnerAvatarUrl || avatarUrl || null) : (avatarUrl || null));
  const dicebearUrl = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${resolvedAvatarSeed || '699ec54eee0505687ea59468'}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
  const avatarSrc = resolvedAvatarUrl || dicebearUrl;
  const fallbackAvatar = useMemo(() => buildFallbackAvatar(resolvedAvatarSeed || '', username), [resolvedAvatarSeed, username]);
  const [avatarSrcState, setAvatarSrcState] = useState(avatarSrc);

  useEffect(() => {
    if (isEditingInline && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editInputRef.current.value.length, editInputRef.current.value.length);
    }
  }, [isEditingInline]);

  useEffect(() => {
    setAvatarSrcState(avatarSrc);
  }, [avatarSrc]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSaveEdit?.(message.id, editValue);
    } else if (e.key === 'Escape') {
      onCancelEdit?.();
    }
  };

  const handleCopyText = () => {
    navigator.clipboard?.writeText(content).catch(() => { });
    setIsMoreMenuOpen(false);
  };

  const handleMessageClick = (e: React.MouseEvent) => {
    if (window.innerWidth < 768) {
      e.stopPropagation();
      setIsMobileThreeDotsVisible(prev => !prev);
      if (isMoreMenuOpen) setIsMoreMenuOpen(false);
    } else {
      setIsMoreMenuOpen(false);
    }
  };

  if (type === 'system') {
    return (
      <li className="select-text list-none">
        <div className={`group relative flex w-full items-center pl-14 pr-4 chat-message-item md:pl-16 ${isHighlighted ? 'bg-yellow-400/5' : ''}`}>
          <div className="absolute left-0 top-0 flex h-full w-10 left-2 items-center justify-center">
            {systemType === 'offline' ? (
              <ArrowLeft className="flex justify-center text-red-500 h-[22px] w-[22px]" />
            ) : (
              <CheckCircle className="flex justify-center text-green-500 h-[22px] w-[22px]" />
            )}
          </div>
          <div className="h-4"></div>
          <div className="flex flex-row items-center py-2">
            <p className="text-sm">
              <span className="text-foreground font-bold inline-flex items-center gap-1">
                {username}
                {isVerified && <ShieldCheck className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10" />}
              </span>
              {' '}<span className="text-muted-foreground">{content}</span>
              <time className="text-muted-foreground text-[10px] leading-snug tracking-tight align-baseline font-medium cursor-default select-none pl-2">
                {timestamp}
              </time>
            </p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <>
      <li className="select-text list-none">
        <div className="pt-4">
          <div
            className={`group relative flex w-full items-start pl-14 pr-4 chat-message-item md:pl-16 cursor-default ${isOwn ? 'msg-own' : 'msg-partner'} ${isHighlighted ? 'bg-yellow-400/5' : ''} ${isEditingInline ? 'bg-popover/50' : ''}`}
            onClick={handleMessageClick} // Toggle dots on mobile tap, close menu on desktop click
            onContextMenu={(e) => {
              if (isEditingInline) return;
              e.preventDefault();
              e.stopPropagation();
              setIsMoreMenuOpen(true);
            }}
          >
            {/* Desktop Hover Actions Toolbar */}
            {!isEditingInline && (
              <div className="absolute z-10 right-0 -top-5 mr-3 hidden drop-shadow-sm hover:drop-shadow-md shadow-black transition-all duration-200 group-hover:md:flex flex-row border border-border rounded-sm bg-popover text-card-foreground p-0.5">
                <button
                  onClick={() => onReply?.(message)}
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 transition-colors"
                  title="Reply"
                >
                  <Reply className="h-3.5 w-3.5" />
                </button>
                {isOwn && (
                  <button
                    onClick={() => onEdit?.(message)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                {!isOwn && (
                  <button
                    onClick={() => onReport?.(message)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 transition-colors text-destructive"
                    title="Report"
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                )}

                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMoreMenuOpen(!isMoreMenuOpen);
                    }}
                    className={`inline-flex items-center justify-center rounded-md text-sm font-medium hover:bg-accent hover:text-accent-foreground h-7 w-7 transition-colors ${isMoreMenuOpen ? 'bg-accent' : ''}`}
                    title="More"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>

                  <AnimatePresence>
                    {isMoreMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsMoreMenuOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg bg-popover border border-border shadow-2xl overflow-hidden py-1"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onReply?.(message);
                              setIsMoreMenuOpen(false);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            Reply
                            <Reply className="h-4 w-4 text-muted-foreground" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopyText(); }}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                          >
                            Copy Text
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </button>

                          {isOwn && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit?.(message);
                                  setIsMoreMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                              >
                                Edit
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete?.(message);
                                  setIsMoreMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors border-t border-border/40"
                              >
                                Delete
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {!isOwn && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReport?.(message);
                                setIsMoreMenuOpen(false);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors border-t border-border/40"
                            >
                              Report
                              <Flag className="h-4 w-4" />
                            </button>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Mobile Action Menu Trigger (Three Dots) */}
            {!isEditingInline && (
              <div className="md:hidden absolute right-3 top-2 z-10">
                <div className="relative">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMoreMenuOpen(!isMoreMenuOpen);
                    }}
                    className={`flex items-center justify-center rounded-md bg-muted/50 h-8 w-8 text-foreground transition-all duration-200 ${isMobileThreeDotsVisible || isMoreMenuOpen ? 'opacity-100' : 'opacity-0'}`}
                    title="More"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>

                  <AnimatePresence>
                    {isMoreMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setIsMoreMenuOpen(false)} />
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          className="absolute right-0 bottom-full mb-2 z-20 w-44 rounded-lg bg-popover border border-border shadow-2xl overflow-hidden py-1"
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onReply?.(message);
                              setIsMoreMenuOpen(false);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent active:bg-accent transition-colors"
                          >
                            Reply
                            <Reply className="h-4 w-4 text-muted-foreground" />
                          </button>

                          <button
                            onClick={(e) => { e.stopPropagation(); handleCopyText(); }}
                            className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent active:bg-accent transition-colors"
                          >
                            Copy Text
                            <Copy className="h-4 w-4 text-muted-foreground" />
                          </button>

                          {isOwn && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEdit?.(message);
                                  setIsMoreMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm text-foreground hover:bg-accent active:bg-accent transition-colors"
                              >
                                Edit
                                <Pencil className="h-4 w-4 text-muted-foreground" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDelete?.(message);
                                  setIsMoreMenuOpen(false);
                                }}
                                className="flex w-full items-center justify-between px-3 py-2 text-sm text-destructive hover:bg-accent active:bg-accent transition-colors border-t border-border/40"
                              >
                                Delete
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}

                          {!isOwn && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReport?.(message);
                                setIsMoreMenuOpen(false);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-sm text-destructive hover:bg-accent active:bg-accent transition-colors border-t border-border/40"
                            >
                              Report
                              <Flag className="h-4 w-4" />
                            </button>
                          )}
                        </motion.div>
                      </>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Avatar */}
            <div className="absolute left-0 top-0 flex h-full">
              <div
                className="absolute z-0 left-2 w-10 select-none overflow-hidden pt-0.5 hover:cursor-pointer"
                style={{ overflowWrap: 'break-word' }}
                onClick={() => onProfileClick?.(username, resolvedAvatarSeed || '', resolvedAvatarUrl)}
              >
                <span className="relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full">
                  <img
                    className="aspect-square h-full w-full"
                    alt={username}
                    src={avatarSrcState}
                    loading="lazy"
                    decoding="async"
                    onError={() => {
                      if (avatarSrcState !== fallbackAvatar) {
                        setAvatarSrcState(fallbackAvatar);
                      }
                    }}
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
                    onClick={() => onProfileClick?.(username, resolvedAvatarSeed || '', resolvedAvatarUrl)}
                  >
                    {username}
                  </span>
                  {isVerified && <ShieldCheck className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 inline-block align-middle ml-1" />}
                </span>
                <time className="text-zinc-500 text-xs leading-snug tracking-tight align-baseline font-medium cursor-default select-none ml-1">
                  {timestamp}
                  {message.isEdited && <span className="ml-1 opacity-70 italic font-normal text-[10px] block sm:inline-block leading-none">(edited)</span>}
                </time>
              </h3>
              <div className="leading w-full flex-1">
                {message.replyToMessage && (
                  <div className="-ml-16 pl-16 mb-0.5 mt-0">
                    <div className="flex items-center gap-1.5 text-[11px] bg-muted/30 hover:bg-muted/50 px-2 py-0.5 rounded border-l-[1.5px] border-primary cursor-pointer w-fit max-w-[90%] md:max-w-[80%] transition-colors">
                      <Reply className="h-[10px] w-[10px] sm:h-3 sm:w-3 text-primary shrink-0" />
                      <span className="font-bold text-primary shrink-0 truncate max-w-[60px] sm:max-w-[80px]">
                        {message.replyToMessage.username}
                      </span>
                      <span className="text-foreground/70 truncate italic min-w-0">
                        {message.replyToMessage.content}
                      </span>
                    </div>
                  </div>
                )}
                {isEditingInline ? (
                  <div className="w-full mt-1 text-left">
                    <textarea
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="w-full textarea text-foreground rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
                      rows={1}
                      style={{ height: 'auto', minHeight: '38px' }}
                    />
                    <div className="text-[12px] text-[#dcdef3]/60 mt-2 ml-0.5">
                      escape to <span className="text-[#00a8fc] underline underline-offset-2 cursor-pointer" onClick={() => onCancelEdit?.()}>cancel</span> or <span className="text-[#00a8fc] cursor-pointer" onClick={() => editValue.trim() && onSaveEdit?.(message.id, editValue.trim())}>enter</span> to save
                    </div>
                  </div>
                ) : (
                  <div
                    className="-ml-16 select-text pl-16 leading-snug sm:leading-normal whitespace-pre-wrap break-words break-all max-md:select-none chat-message-text mt-0.5"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {content.startsWith('![image]') || content.startsWith('![gif]') ? (
                      <div className="mt-2.5 relative group/gif">
                        <ModernImage
                          src={content.match(/\((.*?)\)/)?.[1] || ''}
                          alt={content.startsWith('![gif]') ? "GIF" : "Shared image"}
                          status={message.status}
                          progress={message.progress}
                          isGif={content.startsWith('![gif]')}
                        />
                        {content.startsWith('![gif]') && (
                          <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider select-none pointer-events-none">
                            GIF
                          </div>
                        )}
                      </div>
                    ) : (
                      content
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </li>
    </>
  );
};
