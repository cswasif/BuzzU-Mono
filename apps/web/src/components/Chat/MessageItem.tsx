import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Reply, Trash2, MoreVertical, ArrowLeft, CheckCircle, Pencil, Flag, Copy, ShieldCheck, ExternalLink } from 'lucide-react';
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
  onProfileClick?: (
    username: string,
    avatarSeed: string,
    avatarUrl?: string | null,
    peerId?: string
  ) => void;
  onVanishOpen?: (messageId: string) => void;
}

interface MenuPosition {
  x: number;
  y: number;
}

const URL_PATTERN = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,:;"')\]\}])/gi;

type TextSegment =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string; href: string };

function toHref(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
}

function splitTextSegments(input: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const matches = Array.from(input.matchAll(URL_PATTERN));

  if (matches.length === 0) {
    return [{ kind: 'text', value: input }];
  }

  for (const match of matches) {
    const urlValue = match[0];
    const startIndex = match.index ?? 0;
    if (startIndex > lastIndex) {
      segments.push({ kind: 'text', value: input.slice(lastIndex, startIndex) });
    }
    segments.push({ kind: 'url', value: urlValue, href: toHref(urlValue) });
    lastIndex = startIndex + urlValue.length;
  }

  if (lastIndex < input.length) {
    segments.push({ kind: 'text', value: input.slice(lastIndex) });
  }

  return segments;
}

interface LinkPreviewPayload {
  url: string;
  title: string;
  description: string;
  siteName: string;
  displayUrl: string;
  image: string | null;
  favicon: string | null;
}

const linkPreviewCache = new Map<string, LinkPreviewPayload | null>();
const linkPreviewInflight = new Map<string, Promise<LinkPreviewPayload | null>>();

function inferImageFromUrl(url: URL) {
  const isImageExtension = /\.(apng|avif|gif|jpe?g|jfif|png|svg|webp|bmp|ico)(\?.*)?$/i.test(url.pathname);
  if (isImageExtension) {
    return url.toString();
  }

  if (url.hostname === 'encrypted-tbn.gstatic.com' || url.hostname === 'lh3.googleusercontent.com') {
    return url.toString();
  }

  if (url.hostname.endsWith('imgur.com') && !url.hostname.startsWith('i.')) {
    const id = url.pathname.split('/').filter(Boolean).pop()?.replace(/\.[a-z0-9]+$/i, '') ?? '';
    if (/^[a-zA-Z0-9]+$/.test(id)) {
      return `https://i.imgur.com/${id}.jpg`;
    }
  }

  return null;
}

function buildFallbackPreview(url: string): LinkPreviewPayload | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');
    const rawPath = parsed.pathname === '/' ? '' : parsed.pathname;
    const pathParts = rawPath.split('/').filter(Boolean);
    const titleCore = pathParts.length > 0 ? decodeURIComponent(pathParts[pathParts.length - 1]).replace(/[-_]+/g, ' ') : hostname;
    const title = titleCore.length > 0 ? titleCore.charAt(0).toUpperCase() + titleCore.slice(1) : hostname;
    const displayUrl = `${hostname}${parsed.pathname}${parsed.search}`.slice(0, 90);

    return {
      url: parsed.toString(),
      siteName: hostname,
      title,
      displayUrl,
      description: '',
      image: inferImageFromUrl(parsed),
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
    };
  } catch {
    return null;
  }
}

function isValidPayload(data: unknown): data is LinkPreviewPayload {
  if (!data || typeof data !== 'object') {
    return false;
  }

  const value = data as Record<string, unknown>;
  return (
    typeof value.url === 'string' &&
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    typeof value.siteName === 'string' &&
    typeof value.displayUrl === 'string' &&
    (typeof value.image === 'string' || value.image === null) &&
    (typeof value.favicon === 'string' || value.favicon === null)
  );
}

async function fetchLinkPreview(url: string) {
  if (linkPreviewCache.has(url)) {
    return linkPreviewCache.get(url) ?? null;
  }

  if (linkPreviewInflight.has(url)) {
    return linkPreviewInflight.get(url) ?? null;
  }

  const request = (async () => {
    try {
      const response = await fetch(`/link-preview?url=${encodeURIComponent(url)}`);
      if (!response.ok) {
        const fallback = buildFallbackPreview(url);
        linkPreviewCache.set(url, fallback);
        return fallback;
      }

      const payload = await response.json();
      if (!isValidPayload(payload)) {
        const fallback = buildFallbackPreview(url);
        linkPreviewCache.set(url, fallback);
        return fallback;
      }

      linkPreviewCache.set(url, payload);
      return payload;
    } catch {
      const fallback = buildFallbackPreview(url);
      linkPreviewCache.set(url, fallback);
      return fallback;
    } finally {
      linkPreviewInflight.delete(url);
    }
  })();

  linkPreviewInflight.set(url, request);
  return request;
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
  onProfileClick,
  onVanishOpen
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
  const linkPreviewsEnabled = useSessionStore(state => state.linkPreviewsEnabled);
  const resolvedAvatarSeed = isOwn ? (currentAvatarSeed || avatarSeed) : avatarSeed;
  const resolvedAvatarUrl = isOwn
    ? (currentAvatarUrl || avatarUrl || null)
    : (username === partnerName ? (partnerAvatarUrl || avatarUrl || null) : (avatarUrl || null));
  const dicebearUrl = `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${resolvedAvatarSeed || '699ec54eee0505687ea59468'}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;
  const avatarSrc = resolvedAvatarUrl || dicebearUrl;
  const fallbackAvatar = useMemo(() => buildFallbackAvatar(resolvedAvatarSeed || '', username), [resolvedAvatarSeed, username]);
  const [avatarSrcState, setAvatarSrcState] = useState(avatarSrc);
  const replyAvatarSeed = message.replyToMessage?.avatarSeed || message.replyToMessage?.id || '';
  const replyAvatarLabel = message.replyToMessage?.username || 'User';
  const replyAvatarSrc = message.replyToMessage?.avatarUrl
    || (replyAvatarSeed ? `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${replyAvatarSeed}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80` : buildFallbackAvatar(replyAvatarSeed, replyAvatarLabel));

  useEffect(() => {
    if (isEditingInline && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editInputRef.current.value.length, editInputRef.current.value.length);
    }
  }, [isEditingInline]);

  useEffect(() => {
    setAvatarSrcState(avatarSrc);
  }, [avatarSrc]);

  const textSegments = useMemo(() => splitTextSegments(content), [content]);
  const firstUrl = useMemo(() => textSegments.find(segment => segment.kind === 'url')?.href ?? null, [textSegments]);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewPayload | null>(null);
  const [isLinkPreviewLoading, setIsLinkPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!firstUrl || !linkPreviewsEnabled) {
      setLinkPreview(null);
      setIsLinkPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const cached = linkPreviewCache.get(firstUrl);
    if (cached !== undefined) {
      setLinkPreview(cached);
      setIsLinkPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setIsLinkPreviewLoading(true);
    fetchLinkPreview(firstUrl).then((preview) => {
      if (cancelled) {
        return;
      }
      setLinkPreview(preview);
      setIsLinkPreviewLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [firstUrl, linkPreviewsEnabled]);

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
  const emitProfileClick = (
    username: string,
    avatarSeed: string,
    avatarUrl?: string | null,
    peerId?: string,
  ) => {
    if (!onProfileClick) return;
    if (peerId !== undefined) {
      onProfileClick(username, avatarSeed, avatarUrl, peerId);
      return;
    }
    onProfileClick(username, avatarSeed, avatarUrl);
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
                onClick={() =>
                  emitProfileClick(
                    username,
                    resolvedAvatarSeed || '',
                    resolvedAvatarUrl,
                    message.senderId,
                  )
                }
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
                    onClick={() =>
                      emitProfileClick(
                        username,
                        resolvedAvatarSeed || '',
                        resolvedAvatarUrl,
                        message.senderId,
                      )
                    }
                  >
                    {username}
                  </span>
                  {isVerified && <ShieldCheck className="h-3.5 w-3.5 text-blue-500 fill-blue-500/10 inline-block align-middle ml-1" />}
                </span>
                <time className="text-zinc-500 text-xs leading-snug tracking-tight align-baseline font-medium cursor-default select-none ml-1">
                  {timestamp}
                </time>
              </h3>
              <div className="leading w-full flex-1">
                {message.replyToMessage && (
                  <div className="-ml-16 pl-16 mb-0.5 mt-0">
                    <div className="flex items-center gap-1.5 text-[11px] cursor-pointer w-fit max-w-[90%] md:max-w-[80%] transition-colors">
                      <div className="h-[1px] w-10 bg-muted-foreground/40"></div>
                      <span className="relative flex shrink-0 overflow-hidden h-4 w-4 rounded-full">
                        <img
                          className="aspect-square h-full w-full"
                          alt={replyAvatarLabel}
                          src={replyAvatarSrc}
                          loading="lazy"
                          decoding="async"
                        />
                      </span>
                      <span className="font-bold text-muted-foreground shrink-0 truncate max-w-[60px] sm:max-w-[80px]">
                        {message.replyToMessage.username}
                      </span>
                      <span className="text-muted-foreground truncate min-w-0 font-semibold">
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
                    className="-ml-16 select-text pl-16 leading-snug sm:leading-normal whitespace-pre-wrap break-words [word-break:break-word] [overflow-wrap:anywhere] max-md:select-none chat-message-text mt-0.5"
                  >
                    {content.startsWith('![image]') || content.startsWith('![gif]') ? (
                      <div className="mt-2.5 relative group/gif">
                        <ModernImage
                          src={content.match(/\((.*?)\)/)?.[1] || ''}
                          alt={content.startsWith('![gif]') ? "GIF" : "Shared image"}
                          status={message.status}
                          progress={message.progress}
                          isGif={content.startsWith('![gif]')}
                          isVanish={message.isVanish}
                          vanishOpened={message.vanishOpened}
                          onVanishOpen={() => onVanishOpen?.(message.id)}
                        />
                        {content.startsWith('![gif]') && (
                          <div className="absolute top-2 left-2 bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider select-none pointer-events-none">
                            GIF
                          </div>
                        )}
                      </div>
                    ) : (
                      <>
                        {textSegments.map((segment, index) => {
                          if (segment.kind === 'text') {
                            return <React.Fragment key={`text-${index}`}>{segment.value}</React.Fragment>;
                          }

                          return (
                            <a
                              key={`url-${index}`}
                              href={segment.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 hover:text-sky-300 hover:underline underline-offset-2 break-all"
                            >
                              {segment.value}
                            </a>
                          );
                        })}
                        {message.isEdited && <span className="ml-1 align-baseline text-[11px] font-medium italic text-zinc-500/60 select-none">(edited)</span>}
                        {linkPreviewsEnabled && isLinkPreviewLoading && firstUrl && (
                          <div className="mt-2.5 block max-w-[min(100%,34rem)] overflow-hidden rounded-2xl border border-border/70 bg-card/70 p-3 sm:p-3.5">
                            <div className="h-28 w-full animate-pulse rounded-xl bg-muted/50" />
                            <div className="mt-3 h-3 w-20 animate-pulse rounded bg-muted/50" />
                            <div className="mt-2 h-4 w-3/4 animate-pulse rounded bg-muted/50" />
                            <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-muted/50" />
                          </div>
                        )}
                        {linkPreviewsEnabled && linkPreview && (
                          <a
                            href={linkPreview.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2.5 block max-w-[min(100%,34rem)] overflow-hidden rounded-2xl border border-border/70 bg-card/70 transition-colors hover:bg-card"
                          >
                            {linkPreview.image && (
                              <img
                                src={linkPreview.image}
                                alt={linkPreview.title}
                                className="h-32 w-full object-cover sm:h-40"
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                            <div className="flex items-start gap-3 p-3 sm:p-3.5">
                              {linkPreview.favicon && (
                                <img
                                  src={linkPreview.favicon}
                                  alt={linkPreview.siteName}
                                  className="h-9 w-9 shrink-0 rounded-lg bg-muted/60 p-1.5"
                                  loading="lazy"
                                  decoding="async"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                  {linkPreview.siteName}
                                </p>
                                <p className="mt-0.5 truncate text-sm font-semibold text-foreground sm:text-[15px]">
                                  {linkPreview.title}
                                </p>
                                {linkPreview.description && (
                                  <p className="mt-1 overflow-hidden text-xs text-muted-foreground sm:text-[13px] [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                                    {linkPreview.description}
                                  </p>
                                )}
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  {linkPreview.displayUrl}
                                </p>
                              </div>
                              <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            </div>
                          </a>
                        )}
                      </>
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
