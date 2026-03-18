import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, Lock, ShieldCheck } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    peerId?: string;
    username: string;
    avatarSeed: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    interests?: string[];
    joinedAt?: string | null;
    badgeVisibility?: 'Everyone' | 'Friends' | 'Nobody';
    interestsVisibility?: 'Everyone' | 'Friends' | 'Nobody';
    onAddFriend?: () => void;
    onAcceptFriend?: () => void;
    onDeclineFriend?: () => void;
    requestStatus?: 'none' | 'sent' | 'received' | 'friends';
}

export function ProfileModal({
    isOpen,
    onClose,
    peerId,
    username,
    avatarSeed,
    avatarUrl,
    isVerified,
    interests,
    joinedAt,
    badgeVisibility,
    interestsVisibility,
    onAddFriend,
    onAcceptFriend,
    onDeclineFriend,
    requestStatus = 'none'
}: ProfileModalProps) {
    const navigate = useNavigate();
    const selfPeerId = useSessionStore(s => s.peerId);
    const selfDisplayName = useSessionStore(s => s.displayName);
    const selfJoinedAt = useSessionStore(s => s.joinedAt);
    const selfInterests = useSessionStore(s => s.interests);
    const selfBadgeVisibility = useSessionStore(s => s.badgeVisibility);
    const selfInterestsVisibility = useSessionStore(s => s.interestsVisibility);
    const setDmFriend = useSessionStore(s => s.setDmFriend);
    const friendList = useSessionStore(s => s.friendList);
    const blockUser = useSessionStore(s => s.blockUser);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [showBlockConfirm, setShowBlockConfirm] = useState(false);
    const actionMenuRef = useRef<HTMLDivElement>(null);

    const isSelf = username === 'Me' || username === selfDisplayName;
    const canViewFriendOnly = requestStatus === 'friends';
    const effectiveBadgeVisibility = isSelf ? selfBadgeVisibility : (badgeVisibility || 'Nobody');
    const effectiveInterestsVisibility = isSelf ? selfInterestsVisibility : (interestsVisibility || 'Nobody');
    const shouldShowVerifiedBadge = Boolean(isVerified) && (
        effectiveBadgeVisibility === 'Everyone' ||
        (effectiveBadgeVisibility === 'Friends' && canViewFriendOnly) ||
        isSelf
    );
    const shouldHideInterests = !isSelf && (
        effectiveInterestsVisibility === 'Nobody' ||
        (effectiveInterestsVisibility === 'Friends' && !canViewFriendOnly)
    );
    const profileInterests = isSelf ? selfInterests : (interests || []);
    const effectiveJoinedAt = isSelf ? selfJoinedAt : joinedAt;
    const joinedDateLabel = (() => {
        const date = new Date(effectiveJoinedAt || '');
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString('en-GB');
    })();
    const targetPeerId = peerId || friendList.find(f => f.username === username)?.id || useSessionStore.getState().partnerId || '';

    const getButtonText = () => {
        if (isSelf) return 'Edit Profile';
        switch (requestStatus) {
            case 'sent':
                return 'Friend Request Sent';
            case 'received':
                return 'Accept Request';
            case 'friends':
                return 'Message';
            default:
                return 'Add Friend';
        }
    };

    const isButtonDisabled = isSelf ? false : (requestStatus === 'sent');

    const handleButtonClick = () => {
        if (isSelf) {
            try {
                const evt = new Event('open-settings-modal');
                window.dispatchEvent(evt);
            } finally {
                onClose();
            }
            return;
        }
        if (requestStatus === 'friends') {
            try {
                // Find the friend by username to get their ID
                const friend = friendList.find(f => f.username === username);
                const friendId = friend?.id || useSessionStore.getState().partnerId;
                if (friendId) {
                    const friendObj = friend || { id: friendId, username, avatarSeed, avatarUrl: avatarUrl || null };
                    setDmFriend(friendObj);
                    navigate(`/chat/dm/${friendId}`);
                }
            } finally {
                onClose();
            }
            return;
        }
        if (requestStatus === 'received' && onAcceptFriend) {
            onAcceptFriend();
        } else if (onAddFriend) {
            onAddFriend();
        }
    };

    const userId = peerId || (isSelf ? selfPeerId : avatarSeed) || 'Unknown';
    const avatarSrc = avatarUrl || `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${userId}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            if (!showActionMenu) return;
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
                setShowActionMenu(false);
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        return () => document.removeEventListener('mousedown', onPointerDown);
    }, [showActionMenu]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="fixed left-[50%] sm:top-[50%] max-sm:bottom-4 z-[110] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-lg rounded-xl md:w-full select-text bg-transparent sm:max-w-[300px] p-0 border-none outline-none overflow-hidden max-h-[85dvh] flex flex-col"
            >
                <div className="bg-popover mt-1 sm:-mt-1 rounded-t-lg sm:rounded-lg relative pb-1 h-full overflow-y-auto shadow-2xl flex-shrink">
                    {/* Header/Banner Area */}
                    <div className="space-y-1.5 text-center sm:text-left flex flex-col items-center rounded-t-lg justify-center gap-2 px-2 py-4 bg-muted h-24 relative">
                        {/* Close button for convenience */}
                        <button
                            onClick={onClose}
                            className="absolute top-2 right-2 p-1 rounded-full hover:bg-black/10 transition-colors sm:hidden"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>

                    {/* Avatar Overlay */}
                    <div className="absolute top-0 my-16 left-0 right-0 mx-auto inline-block w-min z-10">
                        <div className="relative">
                            <span className="flex shrink-0 overflow-hidden relative h-16 w-16 rounded-3xl ring-4 ring-popover">
                                <img
                                    className="aspect-square h-full w-full bg-muted"
                                    alt={username}
                                    src={avatarSrc}
                                />
                            </span>
                            <div className="absolute bg-black rounded-full ring-2 ring-zinc-700 bottom-0 right-0 mr-[1px] mb-[1px] h-4 w-4 border-2 border-popover"></div>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="pt-8">
                        <div className="bg-action rounded-md my-2.5 mx-5 flex items-center justify-center flex-col overflow-y-auto relative z-30">
                            <span className="flex items-center gap-1 font-semibold w-full justify-center mt-8 text-foreground">
                                {username}
                                {shouldShowVerifiedBadge && <ShieldCheck className="h-4 w-4 text-blue-500 fill-blue-500/10 ml-0.5" />}
                            </span>
                            <div className="flex flex-col items-center justify-center px-2 pb-4 w-full">
                                <code className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded text-[10px] mt-1">
                                    ID:{userId.substring(0, 24)}
                                </code>
                                <div className="shrink-0 h-[1px] w-full mt-3 bg-border/40"></div>

                                <div className="mt-3 w-full flex items-center justify-center rounded-md overflow-visible relative">
                                    <button
                                        onClick={handleButtonClick}
                                        disabled={isButtonDisabled}
                                        className={`inline-flex items-center justify-center text-sm font-medium h-9 px-4 flex-1 rounded-l-md transition-colors ${isButtonDisabled
                                            ? 'bg-muted text-muted-foreground cursor-not-allowed'
                                            : 'bg-primary text-primary-foreground hover:bg-primary/90'
                                            }`}
                                    >
                                        {getButtonText()}
                                    </button>
                                    {!isSelf && (
                                        <div className="relative" ref={actionMenuRef}>
                                            <button
                                                onClick={() => {
                                                    if (requestStatus === 'received') {
                                                        onDeclineFriend?.();
                                                        return;
                                                    }
                                                    setShowActionMenu(prev => !prev);
                                                }}
                                                className={`inline-flex items-center justify-center text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 rounded-r-md border-l border-primary/10 transition-colors ${requestStatus === 'received' ? 'hover:bg-destructive/10' : ''
                                                    }`}
                                                type="button"
                                                aria-haspopup={requestStatus === 'received' ? undefined : 'menu'}
                                                aria-expanded={requestStatus === 'received' ? undefined : showActionMenu}
                                            >
                                                {requestStatus === 'received' ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
                                            </button>
                                            {requestStatus !== 'received' && showActionMenu && (
                                                <div className="absolute right-0 bottom-full mb-1 z-[200] min-w-[110px] rounded-md border border-border bg-popover p-1 shadow-lg pointer-events-auto">
                                                    <button
                                                        type="button"
                                                        className="w-full rounded-sm px-2.5 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-red-900/50 hover:text-red-200"
                                                        onClick={() => {
                                                            setShowActionMenu(false);
                                                            setShowBlockConfirm(true);
                                                        }}
                                                    >
                                                        Block
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Join Date & Interests Section */}
                        <div className="bg-action rounded-md py-3 my-2.5 mx-5 flex items-center justify-center flex-col px-4 relative z-10">
                            <div className="mb-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                BuzzU JOIN DATE
                            </div>
                            <div className="text-xs font-medium">{joinedDateLabel}</div>

                            <div className="text-[10px] text-muted-foreground mt-4 mb-2 font-bold uppercase tracking-wider">
                                Interests
                            </div>

                            <div className="mt-1 w-full rounded-md bg-panel/50 px-2 py-3 text-center relative overflow-hidden group">
                                {shouldHideInterests ? (
                                    <>
                                        <div className="select-none blur-[3px] opacity-40 flex flex-wrap justify-center gap-1">
                                            <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">No interests</span>
                                            <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">Hidden</span>
                                            <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">Private</span>
                                        </div>
                                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-20">
                                            <Lock className="h-5 w-5 mb-1 text-foreground/70" />
                                            <span className="text-xs font-bold text-foreground">Hidden</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="select-none flex flex-wrap justify-center gap-1">
                                        {(profileInterests.length > 0 ? profileInterests : ['No interests']).map((interest) => (
                                            <span key={interest} className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">
                                                {interest}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {isSelf && (
                                <div className="mt-2 text-[10px] text-muted-foreground">
                                    Visible to {effectiveInterestsVisibility}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Desktop Close Icon (optional, user HTML has the close trigger outside) */}
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 rounded-full p-1 opacity-50 hover:opacity-100 transition-opacity sm:block hidden hover:bg-black/5"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>
            </motion.div>
            <AnimatePresence>
                {showBlockConfirm && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[120] bg-black/65"
                            onClick={() => setShowBlockConfirm(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 8 }}
                            role="alertdialog"
                            aria-describedby="block-confirm-description"
                            aria-labelledby="block-confirm-title"
                            className="fixed left-[50%] top-[50%] z-[130] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg md:w-full"
                        >
                            <div className="flex flex-col space-y-2 text-center sm:text-left">
                                <h2 id="block-confirm-title" className="text-lg font-semibold flex flex-row gap-2 items-center text-destructive">
                                    <svg stroke="currentColor" fill="currentColor" strokeWidth="0" viewBox="0 0 16 16" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M6 11.5c0-2.363 1.498-4.383 3.594-5.159.254-.571.406-1.206.406-1.841 0-2.485 0-4.5-3-4.5s-3 2.015-3 4.5c0 1.548.898 3.095 2 3.716v.825c-3.392.277-6 1.944-6 3.959h6.208c-.135-.477-.208-.98-.208-1.5z"></path>
                                        <path d="M11.5 7c-2.485 0-4.5 2.015-4.5 4.5s2.015 4.5 4.5 4.5c2.485 0 4.5-2.015 4.5-4.5s-2.015-4.5-4.5-4.5zM14 12h-5v-1h5v1z"></path>
                                    </svg>
                                    Block
                                </h2>
                                <p id="block-confirm-description" className="text-sm text-muted-foreground">
                                    Are you sure you want to block <b>{username}</b>
                                </p>
                            </div>
                            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
                                <button
                                    type="button"
                                    className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2 mt-2 sm:mt-0"
                                    onClick={() => setShowBlockConfirm(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    className="inline-flex disabled:select-none items-center justify-center rounded-md text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 py-2"
                                    onClick={() => {
                                        if (targetPeerId) {
                                            blockUser({
                                                id: targetPeerId,
                                                username,
                                                avatarSeed,
                                                avatarUrl: avatarUrl || null,
                                            });
                                        }
                                        setShowBlockConfirm(false);
                                        onClose();
                                    }}
                                >
                                    Block
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
