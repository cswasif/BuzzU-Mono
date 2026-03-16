import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ProfileModal } from './ProfileModal';
import { PeerStatusIndicator } from './PeerStatusIndicator';
import { Message } from './types';
import { useDmSignaling } from '../../context/DmSignalingContext';
import { useSessionStore } from '../../stores/sessionStore';
import { useFileTransfer } from '../../hooks/useFileTransfer';
import { useWasm } from '../../hooks/useWasm';
import { usePeerStatus } from '../../hooks/usePeerStatus';
import { ArrowLeft } from 'lucide-react';

function makeId() {
    return Date.now().toString() + Math.random().toString(36).slice(2);
}

function now() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface DmChatAreaProps {
    onBack: () => void;
}

export function DmChatArea({ onBack }: DmChatAreaProps) {
    const {
        activeDmFriend,
        setHasNewDmMessage,
        dmMessages,
        avatarSeed,
        avatarUrl,
        isVerified,
        displayName,
        addDmMessage,
        updatePeerProfile,
    } = useSessionStore();

    const { updateActivity: updatePeerActivity } = usePeerStatus(activeDmFriend?.id);

    const { wasm } = useWasm();
    const { sendFile, receiveChunk } = useFileTransfer({
        onProgress: (progress) => {
            console.log(`[DmChatArea] Upload progress: ${progress}%`);
        },
        onComplete: (blob) => {
            if (!activeDmFriend) return;
            const url = URL.createObjectURL(blob);
            blobUrlsRef.current.add(url);
            addDmMessage(activeDmFriend.id, {
                id: makeId(),
                username: activeDmFriend.username || 'Friend',
                avatarSeed: activeDmFriend.avatarSeed,
                avatarUrl: null,
                timestamp: now(),
                content: `![image](${url})`,
            });
        },
    });
    const fileTransferChannelRef = useRef<RTCDataChannel | null>(null);
    const blobUrlsRef = useRef<Set<string>>(new Set());

    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const { sendDmMessage, editDmMessage, deleteDmMessage, sendTyping, sendProfile, onTyping, onProfile, getDataChannel, onDataChannel, initWebRTC } = useDmSignaling();

    const currentMessages = activeDmFriend ? (dmMessages[activeDmFriend.id] || []) : [];

    useEffect(() => {
        if (activeDmFriend) {
            setHasNewDmMessage(false);
            setIsPartnerTyping(false); // Reset on switch
        }
    }, [activeDmFriend, setHasNewDmMessage]);

    // Handle incoming typing events
    useEffect(() => {
        if (!activeDmFriend) return;
        return onTyping((friendId, isTyping) => {
            if (friendId === activeDmFriend.id) {
                setIsPartnerTyping(isTyping);
            }
        });
    }, [activeDmFriend, onTyping]);

    // Handle incoming profile updates
    useEffect(() => {
        if (!activeDmFriend) return;
        return onProfile((friendId, username, avatarSeed, incomingAvatarUrl) => {
            updatePeerProfile(friendId, {
                username: username || undefined,
                avatarSeed: avatarSeed || undefined,
                avatarUrl: incomingAvatarUrl,
            });
        });
    }, [activeDmFriend, onProfile, updatePeerProfile]);

    useEffect(() => {
        if (!activeDmFriend) return;
        sendProfile(activeDmFriend.id, {
            username: displayName || 'Anonymous',
            avatarSeed,
            avatarUrl: avatarUrl || null,
        });
    }, [activeDmFriend, avatarSeed, avatarUrl, displayName, sendProfile]);

    // Initialize WebRTC for file transfers when friend is active
    useEffect(() => {
        if (!activeDmFriend) return;

        console.log(`[DmChatArea] Initializing WebRTC for friend: ${activeDmFriend.id.slice(0, 15)}…`);
        initWebRTC(activeDmFriend.id);

        const attachChannelHandlers = (channel: RTCDataChannel) => {
            channel.binaryType = 'arraybuffer';
            channel.onmessage = (event) => {
                receiveChunk(event.data);
            };
        };

        // Get existing data channel if available
        const existingChannel = getDataChannel(activeDmFriend.id);
        if (existingChannel) {
            fileTransferChannelRef.current = existingChannel;
            attachChannelHandlers(existingChannel);
        }

        // Register callback for new data channels
        const unregister = onDataChannel((channel, from) => {
            if (from === activeDmFriend.id) {
                fileTransferChannelRef.current = channel;
                attachChannelHandlers(channel);
                console.log(`[DmChatArea] Data channel received for friend: ${from.slice(0, 15)}…`);
            }
        });

        return () => {
            unregister();
            fileTransferChannelRef.current = null;
        };
    }, [activeDmFriend, initWebRTC, getDataChannel, onDataChannel, receiveChunk]);

    const handleTyping = useCallback((isTyping: boolean) => {
        if (activeDmFriend) {
            sendTyping(activeDmFriend.id, isTyping);
        }
        if (isTyping) {
            updatePeerActivity();
        }
    }, [activeDmFriend, sendTyping, updatePeerActivity]);

    const handleReply = (message: Message) => {
        setReplyingTo(message);
        setEditingMessageId(null);
    };

    const handleEdit = (message: Message) => {
        if (message.username === 'Me') {
            setEditingMessageId(message.id);
            setReplyingTo(null);
        }
    };

    const handleSaveEdit = (id: string, newContent: string) => {
        if (!activeDmFriend) return;
        editDmMessage(activeDmFriend.id, id, newContent);
        setEditingMessageId(null);
    };

    const handleCancelEdit = () => setEditingMessageId(null);

    const handleDelete = (msg: Message) => {
        if (!activeDmFriend) return;
        deleteDmMessage(activeDmFriend.id, msg.id);
    };

    const compressImage = useCallback(
        async (file: File): Promise<Blob> => {
            // Only compress images over 500KB or specific types
            if (file.size < 500 * 1024 || !file.type.startsWith("image/")) {
                return file;
            }

            if (!wasm || !wasm.ImageCompressor) {
                console.warn(
                    "[DmChatArea] WASM/ImageCompressor not ready, sending original",
                );
                return file;
            }

            const compressor = new wasm.ImageCompressor();
            try {
                console.log(
                    "[DmChatArea] Compressing image:",
                    file.name,
                    (file.size / 1024).toFixed(1),
                    "KB",
                );
                const arrayBuffer = await file.arrayBuffer();
                const uint8Array = new Uint8Array(arrayBuffer);

                // Shrink to fit under 500KB or 1280px max dimension
                const compressed = compressor.compress_to_webp(uint8Array, 1280, 1280);

                const blob = new Blob([compressed], { type: "image/webp" });
                console.log(
                    "[DmChatArea] Compression complete:",
                    (blob.size / 1024).toFixed(1),
                    "KB",
                );
                return blob;
            } catch (err) {
                console.error("[DmChatArea] Compression failed, sending original:", err);
                return file;
            } finally {
                try {
                    compressor.free();
                } catch (e) {
                    console.warn("[DmChatArea] Failed to free compressor:", e);
                }
            }
        },
        [wasm],
    );

    const handleSelectFiles = useCallback(
        async (files: File[]) => {
            console.log("[DmChatArea] handleSelectFiles called:", files.length);
            if (!activeDmFriend) {
                console.warn("[DmChatArea] Cannot send files: No active friend");
                return;
            }

            const friendId = activeDmFriend.id;

            const waitForDataChannelOpen = async (timeoutMs = 20000) => {
                const start = Date.now();
                while (Date.now() - start < timeoutMs) {
                    const channel = getDataChannel(friendId);
                    if (channel && channel.readyState === 'open') {
                        fileTransferChannelRef.current = channel;
                        return true;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 200));
                }
                return false;
            };

            // Process files sequentially to avoid chunk interleaved issues on the same data channel
            for (const file of files) {
                // Compress if it's an image
                const processedBlob = file.type.startsWith("image/")
                    ? await compressImage(file)
                    : file;
                const url = URL.createObjectURL(processedBlob);
                blobUrlsRef.current.add(url);

                addDmMessage(friendId, {
                    id: makeId(),
                    username: 'Me',
                    avatarSeed: avatarSeed,
                    avatarUrl: avatarUrl || null,
                    timestamp: now(),
                    content: `![image](${url})`,
                    isVerified: isVerified,
                });

                let channel = fileTransferChannelRef.current;
                if (!channel || channel.readyState !== 'open') {
                    const channelOpened = await waitForDataChannelOpen();
                    if (!channelOpened) {
                        console.warn("[DmChatArea] Data channel not ready for file transfer");
                        continue;
                    }
                    channel = fileTransferChannelRef.current;
                }

                if (!channel || channel.readyState !== 'open') {
                    console.warn("[DmChatArea] Data channel not ready for file transfer");
                    continue;
                }

                try {
                    console.log(`[DmChatArea] Sending file: ${file.name}`);
                    const fileToSend = processedBlob instanceof File
                        ? processedBlob
                        : new File([processedBlob], file.name, { type: processedBlob.type });
                    await sendFile(channel, fileToSend);
                    console.log(`[DmChatArea] File sent successfully: ${file.name}`);
                    updatePeerActivity();
                } catch (err) {
                    console.error("[DmChatArea] Failed to send file:", err);
                }
            }
        },
        [activeDmFriend, avatarSeed, avatarUrl, compressImage, sendFile, addDmMessage, getDataChannel, isVerified, updatePeerActivity],
    );

    const handleSendMessage = useCallback((content: string, replyToMessage?: Message | null) => {
        if (!content.trim() && !content.startsWith('![gif]')) return;
        if (!activeDmFriend) return;

        // Add message via Yjs — auto-syncs to Zustand store + peer via CRDT
        sendDmMessage(activeDmFriend.id, {
            id: makeId(),
            senderName: displayName || 'Anonymous',
            avatarSeed: avatarSeed,
            avatarUrl: avatarUrl || null,
            timestamp: now(),
            content,
            isVerified: isVerified,
            replyToId: replyToMessage?.id || null,
            replyToContent: replyToMessage?.content || null,
            replyToSenderName: replyToMessage?.username || null,
        });

        setReplyingTo(null);
        updatePeerActivity();
    }, [sendDmMessage, activeDmFriend, displayName, isVerified, avatarSeed, avatarUrl, updatePeerActivity]);

    const sanitizedMessages = useMemo(() => {
        if (currentMessages.length === 0) return currentMessages;
        const knownBlobs = blobUrlsRef.current;
        return currentMessages.map((message) => {
            if (!message.content || !message.content.includes('blob:')) return message;
            const blobMatches = message.content.match(/blob:[^\s)]+/g);
            if (!blobMatches) return message;
            const hasUnknownBlob = blobMatches.some((blobUrl) => !knownBlobs.has(blobUrl));
            if (!hasUnknownBlob) return message;
            return {
                ...message,
                content: message.content.replace(/!\[[^\]]*\]\(blob:[^)]+\)/g, '[Image unavailable]'),
            };
        });
    }, [currentMessages]);

    if (!activeDmFriend) return null;

    const AVATAR_BASE = 'https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80';
    const friendAvatarUrl = activeDmFriend.avatarUrl || `${AVATAR_BASE}&seed=${activeDmFriend.avatarSeed}`;

    return (
        <main className="w-full flex h-full flex-grow flex-col overflow-hidden">
            {/* ── DM Header Bar ── */}
            <div className="flex lg:hidden items-center gap-3 px-4 py-2.5 bg-background/80 backdrop-blur-sm shrink-0">
                <button
                    onClick={onBack}
                    className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    aria-label="Back to dashboard"
                >
                    <ArrowLeft className="h-5 w-5" />
                </button>

                <button
                    onClick={() => setIsProfileOpen(true)}
                    className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
                >
                    <span className="relative flex shrink-0 overflow-hidden h-8 w-8 rounded-full ring-2 ring-border">
                        <img
                            className="aspect-square h-full w-full"
                            alt={activeDmFriend.username}
                            src={friendAvatarUrl}
                        />
                    </span>
                    <div className="flex flex-col items-start">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground leading-tight">
                                @{activeDmFriend.username}
                            </span>
                            <PeerStatusIndicator targetPeerId={activeDmFriend.id} size="sm" />
                        </div>
                        <span className="text-xs text-muted-foreground leading-tight">Direct Message</span>
                    </div>
                </button>
            </div>

            {/* ── Messages ── */}
            {currentMessages.length === 0 ? (
                <div className="flex h-full w-full flex-1 flex-col items-center justify-center select-text">
                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 24 24" className="text-gray-500" height="120" width="120" xmlns="http://www.w3.org/2000/svg">
                        <path d="M7.29117 20.8242L2 22L3.17581 16.7088C2.42544 15.3056 2 13.7025 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.2975 22 8.6944 21.5746 7.29117 20.8242ZM7 12C7 14.7614 9.23858 17 12 17C14.7614 17 17 14.7614 17 12H15C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12H7Z" />
                    </svg>
                    <p className="mb-5 mt-3 text-2xl font-bold text-brightness/70">The conversation starts here!</p>
                    <span className="inline text-center text-lg">
                        Let's begin a great chat with{' '}
                        <b className="inline text-purple-400 cursor-pointer" onClick={() => setIsProfileOpen(true)}>@{activeDmFriend.username}</b>
                    </span>
                    <p className="text-lg">type away and have a good time</p>
                </div>
            ) : (
                <MessageList
                    messages={sanitizedMessages}
                    partnerName={activeDmFriend.username}
                    onReply={handleReply}
                    onEdit={handleEdit}
                    onReport={() => { }}
                    onDelete={handleDelete}
                    highlightedMessageId={highlightedMessageId}
                    editingMessageId={editingMessageId}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onProfileClick={() => setIsProfileOpen(true)}
                    partnerIsVerified={false}
                    hideIntro={true}
                />
            )}

            {/* ── Message Input ── */}
            <MessageInput
                onSend={handleSendMessage}
                connectionState="connected"
                onStart={() => { }}
                onStop={() => { }}
                onSkip={() => { }}
                onTyping={handleTyping}
                isPartnerTyping={isPartnerTyping}
                partnerName={activeDmFriend.username}
                onSelectFiles={handleSelectFiles}
                replyingTo={replyingTo}
                editingMessage={null}
                onCancelReply={() => setReplyingTo(null)}
                onCancelEdit={handleCancelEdit}
                isGifPickerOpen={isGifPickerOpen}
                onToggleGifPicker={() => setIsGifPickerOpen(p => !p)}
                onCloseGifPicker={() => setIsGifPickerOpen(false)}
                isDmMode={true}
            />

            {/* ── Friend Profile Modal ── */}
            {isProfileOpen && (
                <ProfileModal
                    isOpen={true}
                    onClose={() => setIsProfileOpen(false)}
                    username={activeDmFriend.username}
                    avatarSeed={activeDmFriend.avatarSeed}
                    requestStatus="friends"
                    onAddFriend={() => { }}
                />
            )}
        </main>
    );
}
