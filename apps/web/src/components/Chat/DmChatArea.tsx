import React, { useState, useCallback, useEffect } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { ProfileModal } from './ProfileModal';
import { Message } from './types';
import { useDmSignaling } from '../../context/DmSignalingContext';
import { useSessionStore } from '../../stores/sessionStore';
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
        displayName
    } = useSessionStore();

    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
    const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
    const [isGifPickerOpen, setIsGifPickerOpen] = useState(false);
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const { sendDmMessage, editDmMessage, deleteDmMessage } = useDmSignaling();

    const currentMessages = activeDmFriend ? (dmMessages[activeDmFriend.id] || []) : [];

    useEffect(() => {
        if (activeDmFriend) setHasNewDmMessage(false);
    }, [activeDmFriend, setHasNewDmMessage]);

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
    }, [sendDmMessage, activeDmFriend, displayName, isVerified, avatarSeed, avatarUrl]);

    if (!activeDmFriend) return null;

    const AVATAR_BASE = 'https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80';
    const friendAvatarUrl = `${AVATAR_BASE}&seed=${activeDmFriend.avatarSeed}`;

    return (
        <main className="w-full flex h-full flex-grow flex-col overflow-hidden">
            {/* ── DM Header Bar ── */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
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
                        <span className="text-sm font-semibold text-foreground leading-tight">
                            @{activeDmFriend.username}
                        </span>
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
                    messages={currentMessages}
                    partnerName={activeDmFriend.username}
                    onReply={handleReply}
                    onEdit={handleEdit}
                    onReport={() => {}}
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
                onStart={() => {}}
                onStop={() => {}}
                onSkip={() => {}}
                onTyping={() => {}}
                onSelectFiles={() => {}}
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
                    onAddFriend={() => {}}
                />
            )}
        </main>
    );
}
