import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MoreHorizontal, Lock, ShieldCheck } from 'lucide-react';
import { useSessionStore } from '../../stores/sessionStore';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    username: string;
    avatarSeed: string;
    avatarUrl?: string | null;
    isVerified?: boolean;
    onAddFriend?: () => void;
    onAcceptFriend?: () => void;
    onDeclineFriend?: () => void;
    requestStatus?: 'none' | 'sent' | 'received' | 'friends';
}

export function ProfileModal({ isOpen, onClose, username, avatarSeed, avatarUrl, isVerified, onAddFriend, onAcceptFriend, onDeclineFriend, requestStatus = 'none' }: ProfileModalProps) {
    const navigate = useNavigate();
    const selfDisplayName = useSessionStore(s => s.displayName);
    const setDmFriend = useSessionStore(s => s.setDmFriend);
    const friendList = useSessionStore(s => s.friendList);

    if (!isOpen) return null;

    const isSelf = username === 'Me' || username === selfDisplayName;

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
                    const friendObj = friend || { id: friendId, username, avatarSeed };
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

    // Mock ID based on seed for consistency
    const userId = avatarSeed || '699ec54eee0505687ea59468';
    const avatarSrc = avatarUrl || `https://api.dicebear.com/5.x/thumbs/png?shapeColor=FD8A8A,F1F7B5,82AAE3,9EA1D4,A084CA,EBC7E8,A7D2CB,F07DEA,EC7272,FFDBA4,59CE8F,ABC270,FF74B1,31C6D4&backgroundColor=554994,594545,495579,395144,3F3B6C,2B3A55,404258,344D67&translateY=5&seed=${userId}&scale=110&eyesColor=000000,ffffff&faceOffsetY=0&size=80`;

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
                        <div className="bg-action rounded-md my-2.5 mx-5 flex items-center justify-center flex-col overflow-y-auto">
                            <span className="flex items-center gap-1 font-semibold w-full justify-center mt-8 text-foreground">
                                {username}
                                {isVerified && <ShieldCheck className="h-4 w-4 text-blue-500 fill-blue-500/10 ml-0.5" />}
                            </span>
                            <div className="flex flex-col items-center justify-center px-2 pb-4 w-full">
                                <code className="text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded text-[10px] mt-1">
                                    ID:{userId.substring(0, 24)}
                                </code>
                                <div className="shrink-0 h-[1px] w-full mt-3 bg-border/40"></div>

                                <div className="mt-3 w-full flex items-center justify-center rounded-md overflow-hidden">
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
                                        <button
                                            onClick={requestStatus === 'received' ? onDeclineFriend : undefined}
                                            className={`inline-flex items-center justify-center text-sm font-medium bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-3 rounded-r-md border-l border-primary/10 transition-colors ${requestStatus === 'received' ? 'hover:bg-destructive/10' : ''
                                                }`}
                                        >
                                            {requestStatus === 'received' ? <X className="h-5 w-5" /> : <MoreHorizontal className="h-5 w-5" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Join Date & Interests Section */}
                        <div className="bg-action rounded-md py-3 my-2.5 mx-5 flex items-center justify-center flex-col px-4">
                            <div className="mb-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                BuzzU JOIN DATE
                            </div>
                            <div className="text-xs font-medium">25/02/2026</div>

                            <div className="text-[10px] text-muted-foreground mt-4 mb-2 font-bold uppercase tracking-wider">
                                Interests
                            </div>

                            <div className="mt-1 w-full rounded-md bg-panel/50 px-2 py-3 text-center relative overflow-hidden group">
                                {/* Blurred Interests Preview */}
                                <div className="select-none blur-[3px] opacity-40 flex flex-wrap justify-center gap-1">
                                    <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">No interests</span>
                                    <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">Hello</span>
                                    <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">Dont</span>
                                    <span className="px-2 py-0.5 text-[10px] bg-placeholder rounded-full">Mess</span>
                                </div>

                                {/* Overlaid Lock Icon */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-transparent z-20">
                                    <Lock className="h-5 w-5 mb-1 text-foreground/70" />
                                    <span className="text-xs font-bold text-foreground">Hidden</span>
                                </div>
                            </div>
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
        </div>
    );
}
