import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { funAnimalName } from 'fun-animal-names';
import type { Message } from '../components/Chat/types';

// Re-export so existing consumers like DmChatArea that do
// `import { Message } from '../../stores/sessionStore'` keep working.
export type { Message };

export interface SessionState {
    // Identity
    peerId: string;
    displayName: string;
    isVerified: boolean;
    verifiedEmail: string | null;
    idToken: string | null;
    avatarSeed: string;
    avatarUrl: string | null;
    joinedAt: string;

    // Preferences
    interests: string[];
    gender: string; // 'M' | 'F' | 'U'
    genderFilter: string; // 'male' | 'female' | 'both'
    genderModalDismissed: boolean;
    verifiedOnly: boolean;
    chatMode: 'video' | 'text';
    theme: 'dark' | 'light';
    isBracuUser: boolean;
    selectedInstitution: string;
    adminAccessKey: string;

    // Session
    currentRoomId: string | null;
    isInChat: boolean;
    partnerId: string | null;
    partnerName: string | null;
    partnerAvatarSeed: string | null;
    partnerAvatarUrl: string | null;
    partnerIsVerified: boolean;

    // Friends
    friendRequestsSent: string[];
    friendRequestsReceived: { [peerId: string]: { username: string; avatarSeed: string } };
    friendList: { id: string; username: string; avatarSeed: string }[];
    activeDmFriend: { id: string; username: string; avatarSeed: string } | null;
    hasNewDmMessage: boolean;
    dmMessages: Record<string, Message[]>;

    // Actions
    initSession: () => void;
    setDisplayName: (name: string) => void;
    setInterests: (interests: string[]) => void;
    setGender: (gender: string) => void;
    setGenderFilter: (filter: string) => void;
    setGenderModalDismissed: (dismissed: boolean) => void;
    setVerifiedOnly: (verifiedOnly: boolean) => void;
    setChatMode: (mode: 'video' | 'text') => void;
    setTheme: (theme: 'dark' | 'light') => void;
    setAvatarUrl: (avatarUrl: string | null) => void;
    setIsBracuUser: (isBracuUser: boolean) => void;
    setSelectedInstitution: (institution: string) => void;
    setAdminAccessKey: (key: string) => void;
    joinRoom: (roomId: string, partnerId: string, partnerIsVerified: boolean, partnerName?: string, partnerAvatarSeed?: string, partnerAvatarUrl?: string | null) => void;
    setPartnerAvatarUrl: (partnerAvatarUrl: string | null) => void;
    leaveRoom: () => void;
    setVerified: (email: string, token: string) => void;
    resetSession: () => void;
    sendFriendRequest: (peerId: string) => void;
    acceptFriendRequest: (peerId: string, username?: string, avatarSeed?: string) => void;
    declineFriendRequest: (peerId: string) => void;
    handleReceivedFriendRequest: (request: { id: string; username: string; avatarSeed: string }) => void;
    setDmFriend: (friend: { id: string; username: string; avatarSeed: string } | null) => void;
    setHasNewDmMessage: (hasNew: boolean) => void;
    addDmMessage: (friendId: string, message: Message) => void;
    clearDmMessages: (friendId: string) => void;
    updateDmMessage: (friendId: string, messageId: string, newContent: string) => void;
    deleteDmMessage: (friendId: string, messageId: string) => void;
    syncDmMessages: (friendId: string, messages: Message[]) => void;
    removeFriend: (friendId: string) => void;
}

function generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateAvatarSeed(): string {
    return Array.from({ length: 24 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

const initialPeerId = generatePeerId();
const initialAvatarSeed = generateAvatarSeed();

export const useSessionStore = create<SessionState>()(
    persist(
        (set, get) => ({
            // Initial state
            peerId: initialPeerId,
            displayName: funAnimalName(initialPeerId),
            avatarSeed: initialAvatarSeed,
            avatarUrl: null,
            joinedAt: new Date().toISOString(),
            isVerified: false,
            verifiedEmail: null,
            idToken: null,
            interests: [],
            gender: 'U',
            genderFilter: 'both',
            genderModalDismissed: false,
            verifiedOnly: false,
            chatMode: 'video',
            theme: 'dark',
            isBracuUser: false,
            selectedInstitution: 'all',
            adminAccessKey: '',
            currentRoomId: null,
            isInChat: false,
            partnerId: null,
            partnerName: null,
            partnerAvatarSeed: null,
            partnerAvatarUrl: null,
            partnerIsVerified: false,

            // Friends
            friendRequestsSent: [],
            friendRequestsReceived: {},
            friendList: [],
            activeDmFriend: null,
            hasNewDmMessage: false,
            dmMessages: {},

            // Actions
            initSession: () => {
                const state = get();
                const updates: Partial<SessionState> = {};

                if (!state.peerId) {
                    updates.peerId = generatePeerId();
                }

                const currentId = updates.peerId || state.peerId;

                // Migrate legacy 'Anonymous' names
                if (!state.displayName || state.displayName.startsWith('Anonymous')) {
                    updates.displayName = funAnimalName(currentId);
                }

                if (!state.joinedAt) {
                    updates.joinedAt = new Date().toISOString();
                }

                // Clear stale in-chat state — on a fresh page load there is no
                // active WebSocket / WebRTC connection, so any persisted chat
                // state from a previous session is stale.
                if (state.isInChat) {
                    updates.currentRoomId = null;
                    updates.isInChat = false;
                    updates.partnerId = null;
                    updates.partnerName = null;
                    updates.partnerAvatarSeed = null;
                    updates.partnerAvatarUrl = null;
                    updates.partnerIsVerified = false;
                }

                if (Object.keys(updates).length > 0) {
                    set(updates);
                }
            },

            setDisplayName: (name) => set({ displayName: name }),
            setInterests: (interests) => set({ interests }),
            setGender: (gender) => set({ gender }),
            setGenderFilter: (filter) => set({ genderFilter: filter }),
            setGenderModalDismissed: (dismissed) => set({ genderModalDismissed: dismissed }),
            setVerifiedOnly: (verifiedOnly) => set({ verifiedOnly }),
            setChatMode: (mode) => set({ chatMode: mode }),
            setTheme: (theme) => set({ theme }),
            setAvatarUrl: (avatarUrl) => set({ avatarUrl }),
            setIsBracuUser: (isBracuUser) => set({ isBracuUser }),
            setSelectedInstitution: (institution) => set({ selectedInstitution: institution }),
            setAdminAccessKey: (key) => set({ adminAccessKey: key }),
            setPartnerAvatarUrl: (partnerAvatarUrl) => set({ partnerAvatarUrl }),

            joinRoom: (roomId, partnerId, partnerIsVerified, partnerName, partnerAvatarSeed, partnerAvatarUrl) => set({
                currentRoomId: roomId,
                isInChat: true,
                partnerId,
                partnerName: partnerName || null,
                partnerAvatarSeed: partnerAvatarSeed || null,
                partnerAvatarUrl: partnerAvatarUrl || null,
                partnerIsVerified,
            }),

            leaveRoom: () => {
                // Trigger disconnect via matchmaker endpoint
                const state = get();
                if (state.currentRoomId && state.peerId) {
                    const baseUrl = import.meta.env.VITE_MATCHMAKER_URL || 'wss://buzzu-matchmaker.md-wasif-faisal.workers.dev';
                    const disconnectUrl = baseUrl.replace(/^ws/, 'http');
                    fetch(`${disconnectUrl}/match/disconnect?peer_id=${state.peerId}`, {
                        method: 'PATCH',
                        credentials: 'include',
                    }).catch(err => console.error('[sessionStore] Failed to disconnect:', err));
                }
                set({
                    currentRoomId: null,
                    isInChat: false,
                    partnerId: null,
                    partnerName: null,
                    partnerAvatarSeed: null,
                    partnerAvatarUrl: null,
                    partnerIsVerified: false,
                });
            },

            setVerified: (email, token) => set({
                isVerified: true,
                verifiedEmail: email,
                idToken: token,
            }),

            resetSession: () => {
                const id = generatePeerId();
                set({
                    peerId: id,
                    displayName: funAnimalName(id),
                    isVerified: false,
                    verifiedEmail: null,
                    idToken: null,
                    interests: [],
                    gender: 'U',
                    genderFilter: 'both',
                    genderModalDismissed: false,
                    verifiedOnly: false,
                    currentRoomId: null,
                    isInChat: false,
                    partnerId: null,
                    partnerName: null,
                    partnerAvatarSeed: null,
                    partnerAvatarUrl: null,
                    partnerIsVerified: false,
                    avatarUrl: null,
                    avatarSeed: generateAvatarSeed(),
                    joinedAt: new Date().toISOString(),
                });
            },

            sendFriendRequest: (peerId) => {
                set((state) => ({
                    friendRequestsSent: [...state.friendRequestsSent, peerId],
                }));
            },

            acceptFriendRequest: (peerId, username, avatarSeed) => {
                set((state) => {
                    const request = state.friendRequestsReceived[peerId];
                    const newRequestsReceived = { ...state.friendRequestsReceived };
                    delete newRequestsReceived[peerId];

                    // Already friends? Skip duplicate add.
                    if (state.friendList.some(f => f.id === peerId)) {
                        return { friendRequestsReceived: newRequestsReceived };
                    }

                    // Prefer stored request data > signaling message data > fallback
                    const newFriend = request
                        ? { id: peerId, username: request.username, avatarSeed: request.avatarSeed }
                        : { id: peerId, username: username || funAnimalName(peerId), avatarSeed: avatarSeed || peerId };

                    return {
                        friendRequestsReceived: newRequestsReceived,
                        friendList: [...state.friendList, newFriend],
                    };
                });
            },

            declineFriendRequest: (peerId) => {
                set((state) => {
                    const newRequestsReceived = { ...state.friendRequestsReceived };
                    delete newRequestsReceived[peerId];
                    return {
                        friendRequestsReceived: newRequestsReceived,
                    };
                });
            },

            handleReceivedFriendRequest: (request) => {
                set((state) => {
                    if (state.friendRequestsReceived[request.id]) return state;
                    return {
                        friendRequestsReceived: {
                            ...state.friendRequestsReceived,
                            [request.id]: { username: request.username, avatarSeed: request.avatarSeed }
                        }
                    };
                });
            },

            setDmFriend: (friend) => set({ activeDmFriend: friend, hasNewDmMessage: false }),
            setHasNewDmMessage: (hasNew) => set({ hasNewDmMessage: hasNew }),
            addDmMessage: (friendId, message) => set((state) => ({
                dmMessages: {
                    ...state.dmMessages,
                    [friendId]: [...(state.dmMessages[friendId] || []), message]
                }
            })),
            clearDmMessages: (friendId) => set((state) => ({
                dmMessages: {
                    ...state.dmMessages,
                    [friendId]: []
                }
            })),
            updateDmMessage: (friendId, messageId, newContent) => set((state) => ({
                dmMessages: {
                    ...state.dmMessages,
                    [friendId]: (state.dmMessages[friendId] || []).map(m =>
                        m.id === messageId ? { ...m, content: newContent } : m
                    )
                }
            })),
            deleteDmMessage: (friendId, messageId) => set((state) => ({
                dmMessages: {
                    ...state.dmMessages,
                    [friendId]: (state.dmMessages[friendId] || []).filter(m => m.id !== messageId)
                }
            })),
            syncDmMessages: (friendId, messages) => set((state) => ({
                dmMessages: {
                    ...state.dmMessages,
                    [friendId]: messages
                }
            })),
            removeFriend: (friendId) => set((state) => {
                const newDmMessages = { ...state.dmMessages };
                delete newDmMessages[friendId];
                return {
                    friendList: state.friendList.filter(f => f.id !== friendId),
                    dmMessages: newDmMessages,
                    activeDmFriend: state.activeDmFriend?.id === friendId ? null : state.activeDmFriend,
                };
            }),
        }),
        {
            name: 'buzzu-session',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                peerId: state.peerId,
                displayName: state.displayName,
                avatarSeed: state.avatarSeed,
                avatarUrl: state.avatarUrl,
                joinedAt: state.joinedAt,
                interests: state.interests,
                gender: state.gender,
                genderFilter: state.genderFilter,
                genderModalDismissed: state.genderModalDismissed,
                verifiedOnly: state.verifiedOnly,
                chatMode: state.chatMode,
                theme: state.theme,
                isBracuUser: state.isBracuUser,
                selectedInstitution: state.selectedInstitution,
                adminAccessKey: state.adminAccessKey,
                friendRequestsSent: state.friendRequestsSent,
                friendRequestsReceived: state.friendRequestsReceived,
                friendList: state.friendList,
                activeDmFriend: state.activeDmFriend,
                // Persist match/room state so it survives route changes (DM ↔ chat)
                currentRoomId: state.currentRoomId,
                isInChat: state.isInChat,
                partnerId: state.partnerId,
                partnerName: state.partnerName,
                partnerAvatarSeed: state.partnerAvatarSeed,
                partnerAvatarUrl: state.partnerAvatarUrl,
                partnerIsVerified: state.partnerIsVerified,
            }),
        }
    )
);
