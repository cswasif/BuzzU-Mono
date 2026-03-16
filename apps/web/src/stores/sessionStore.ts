import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { funAnimalName } from 'fun-animal-names';
import type { Message } from '../components/Chat/types';

// Re-export so existing consumers like DmChatArea that do
// `import { Message } from '../../stores/sessionStore'` keep working.
export type { Message };

export interface MatchRecord {
    id: string; // peerId
    username: string;
    avatarSeed: string;
    avatarUrl: string | null;
    timestamp: string;
    isVerified: boolean;
}

export interface BlockedUserRecord {
    id: string;
    username: string;
    avatarSeed: string;
    avatarUrl: string | null;
    blockedAt: string;
}

export interface Notification {
    id: string;
    type: 'friend_request_accepted' | 'system';
    fromId: string;
    fromUsername: string;
    fromAvatarSeed: string;
    fromAvatarUrl: string | null;
    timestamp: string;
    content: string;
}

export interface SessionState {
    // Identity
    peerId: string;
    deviceId: string;
    tabId: string;
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
    bannerType: 'Simple' | 'Gradient' | 'Mesh';
    bannerColor: string;
    bannerGradient: string;

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
    friendRequestsReceived: { [peerId: string]: { username: string; avatarSeed: string; avatarUrl?: string | null } };
    friendList: { id: string; username: string; avatarSeed: string; avatarUrl?: string | null }[];
    blockedUsers: BlockedUserRecord[];
    activeDmFriend: { id: string; username: string; avatarSeed: string; avatarUrl?: string | null } | null;
    hasNewDmMessage: boolean;
    dmUnreadCounts: Record<string, number>;
    dmMessages: Record<string, Message[]>;
    matchHistory: MatchRecord[];
    notifications: Notification[];

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
    setBannerType: (type: 'Simple' | 'Gradient' | 'Mesh') => void;
    setBannerColor: (color: string) => void;
    setBannerGradient: (gradient: string) => void;
    joinRoom: (roomId: string, partnerId: string, partnerIsVerified: boolean, partnerName?: string, partnerAvatarSeed?: string, partnerAvatarUrl?: string | null) => void;
    setPartnerAvatarUrl: (partnerAvatarUrl: string | null) => void;
    setPartnerProfile: (profile: { username?: string; avatarSeed?: string; avatarUrl?: string | null }) => void;
    leaveRoom: () => void;
    setVerified: (email: string, token: string) => void;
    resetSession: () => void;
    sendFriendRequest: (peerId: string) => void;
    acceptFriendRequest: (peerId: string, username?: string, avatarSeed?: string, avatarUrl?: string | null) => void;
    declineFriendRequest: (peerId: string) => void;
    handleReceivedFriendRequest: (request: { id: string; username: string; avatarSeed: string; avatarUrl?: string | null }) => void;
    setDmFriend: (friend: { id: string; username: string; avatarSeed: string; avatarUrl?: string | null } | null) => void;
    updatePeerProfile: (peerId: string, profile: { username?: string; avatarSeed?: string; avatarUrl?: string | null }) => void;
    setHasNewDmMessage: (hasNew: boolean) => void;
    incrementDmUnread: (friendId: string, amount?: number) => void;
    clearDmUnread: (friendId: string) => void;
    addDmMessage: (friendId: string, message: Message) => void;
    clearDmMessages: (friendId: string) => void;
    updateDmMessage: (friendId: string, messageId: string, newContent: string) => void;
    deleteDmMessage: (friendId: string, messageId: string) => void;
    syncDmMessages: (friendId: string, messages: Message[]) => void;
    removeFriend: (friendId: string) => void;
    blockUser: (user: { id: string; username: string; avatarSeed?: string; avatarUrl?: string | null }) => void;
    unblockUser: (friendId: string) => void;
    isUserBlocked: (friendId: string) => boolean;
    addMatchToHistory: (match: MatchRecord) => void;
    addNotification: (notification: Notification) => void;
    removeNotification: (id: string) => void;
    clearNotifications: () => void;
}

function getRandomBytes(length: number): Uint8Array {
    const buffer = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        crypto.getRandomValues(buffer);
        return buffer;
    }
    for (let i = 0; i < buffer.length; i += 1) {
        buffer[i] = Math.floor(Math.random() * 256);
    }
    return buffer;
}

function randomHex(length: number): string {
    const bytes = getRandomBytes(Math.ceil(length / 2));
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, '0');
    }
    return hex.slice(0, length);
}

function generatePeerId(): string {
    return `peer_${Date.now()}_${randomHex(12)}`;
}

function generateAvatarSeed(): string {
    return randomHex(24);
}

function generateDeviceId(): string {
    return `device_${randomHex(16)}`;
}

function generateTabId(): string {
    return `tab_${randomHex(12)}`;
}

const TAB_PEER_ID_KEY = 'buzzu_tab_peer_id';
const TAB_ID_KEY = 'buzzu_tab_id';
const DEVICE_ID_KEY = 'buzzu_device_id';

let lastDisconnectAt = 0;
let lastDisconnectPeerId = '';

export function sendMatchmakerDisconnect(peerId: string | null | undefined, options?: { useBeacon?: boolean }) {
    if (!peerId) return;
    const now = Date.now();
    if (peerId === lastDisconnectPeerId && now - lastDisconnectAt < 2000) return;
    lastDisconnectAt = now;
    lastDisconnectPeerId = peerId;

    const baseUrl = (process.env.MATCHMAKER_URL || import.meta.env.VITE_MATCHMAKER_URL || 'wss://buzzu-matchmaker.buzzu.workers.dev').replace(/^ws/, 'http');
    const url = `${baseUrl}/match/disconnect?peer_id=${peerId}`;
    if (options?.useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        try {
            navigator.sendBeacon(url);
        } catch {
            fetch(url, { method: 'PATCH', credentials: 'include' }).catch(() => { });
        }
        return;
    }
    fetch(url, { method: 'PATCH', credentials: 'include' }).catch(() => { });
}

const initialPeerId = generatePeerId();
const initialAvatarSeed = generateAvatarSeed();
const initialDeviceId = generateDeviceId();
const initialTabId = generateTabId();

export const useSessionStore = create<SessionState>()(
    persist(
        (set, get) => ({
            // Initial state
            peerId: initialPeerId,
            deviceId: initialDeviceId,
            tabId: initialTabId,
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
            bannerType: 'Simple',
            bannerColor: '#5B21B6',
            bannerGradient: 'linear-gradient(45deg, #d53f8c, #4f46e5)',
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
            blockedUsers: [],
            activeDmFriend: null,
            hasNewDmMessage: false,
            dmUnreadCounts: {},
            dmMessages: {},
            matchHistory: [],
            notifications: [],

            // Actions
            initSession: () => {
                const state = get();
                const updates: Partial<SessionState> = {};

                if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
                    const existingPeerId = sessionStorage.getItem(TAB_PEER_ID_KEY);
                    if (existingPeerId) {
                        if (state.peerId !== existingPeerId) {
                            updates.peerId = existingPeerId;
                        }
                    } else {
                        const newPeerId = generatePeerId();
                        sessionStorage.setItem(TAB_PEER_ID_KEY, newPeerId);
                        updates.peerId = newPeerId;
                    }

                    const existingTabId = sessionStorage.getItem(TAB_ID_KEY);
                    if (existingTabId) {
                        if (state.tabId !== existingTabId) {
                            updates.tabId = existingTabId;
                        }
                    } else {
                        const newTabId = generateTabId();
                        sessionStorage.setItem(TAB_ID_KEY, newTabId);
                        updates.tabId = newTabId;
                    }
                }

                if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
                    const existingDeviceId = localStorage.getItem(DEVICE_ID_KEY);
                    if (existingDeviceId) {
                        if (state.deviceId !== existingDeviceId) {
                            updates.deviceId = existingDeviceId;
                        }
                    } else {
                        const newDeviceId = generateDeviceId();
                        localStorage.setItem(DEVICE_ID_KEY, newDeviceId);
                        updates.deviceId = newDeviceId;
                    }
                }

                if (!state.peerId && !updates.peerId) {
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

                const path = typeof window !== 'undefined' ? window.location.pathname : '';
                const reconnectMatch = path.match(/^\/chat\/(?:new|text)\/([^/?#]+)/);
                const reconnectRoomId = reconnectMatch ? decodeURIComponent(reconnectMatch[1]) : null;
                const isChatLandingPath = /^\/chat\/(?:new|text)\/?$/.test(path);
                let isReloadNavigation = false;
                if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
                    const navEntry = performance
                        .getEntriesByType('navigation')
                        .find((entry) => (entry as PerformanceNavigationTiming).type) as PerformanceNavigationTiming | undefined;
                    isReloadNavigation = navEntry?.type === 'reload';
                }
                const shouldPreserveChat =
                    !!state.currentRoomId &&
                    !!state.partnerId &&
                    ((!!reconnectRoomId && state.currentRoomId === reconnectRoomId) ||
                        (isReloadNavigation && isChatLandingPath));

                // Clear stale in-chat state — on a fresh page load there is no
                // active WebSocket / WebRTC connection, so any persisted chat
                // state from a previous session is stale.
                if (state.isInChat && !shouldPreserveChat) {
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
            setBannerType: (type) => set({ bannerType: type }),
            setBannerColor: (color) => set({ bannerColor: color }),
            setBannerGradient: (gradient) => set({ bannerGradient: gradient }),
            setPartnerAvatarUrl: (partnerAvatarUrl) => set({ partnerAvatarUrl }),
            setPartnerProfile: (profile) => set((state) => ({
                partnerName: profile.username !== undefined ? profile.username : state.partnerName,
                partnerAvatarSeed: profile.avatarSeed !== undefined ? profile.avatarSeed : state.partnerAvatarSeed,
                partnerAvatarUrl: profile.avatarUrl !== undefined ? profile.avatarUrl : state.partnerAvatarUrl,
            })),

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
                    sendMatchmakerDisconnect(state.peerId);
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
                let newTabId = generateTabId();
                if (typeof window !== 'undefined' && typeof sessionStorage !== 'undefined') {
                    sessionStorage.setItem(TAB_PEER_ID_KEY, id);
                    sessionStorage.setItem(TAB_ID_KEY, newTabId);
                }
                set({
                    peerId: id,
                    tabId: newTabId,
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
                    hasNewDmMessage: false,
                    dmUnreadCounts: {},
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

            acceptFriendRequest: (peerId, username, avatarSeed, avatarUrl) => {
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
                        ? { id: peerId, username: request.username, avatarSeed: request.avatarSeed, avatarUrl: request.avatarUrl }
                        : { id: peerId, username: username || funAnimalName(peerId), avatarSeed: avatarSeed || peerId, avatarUrl: avatarUrl || null };

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
                            [request.id]: {
                                username: request.username,
                                avatarSeed: request.avatarSeed,
                                avatarUrl: request.avatarUrl
                            }
                        }
                    };
                });
            },

            setDmFriend: (friend) => set((state) => {
                if (!friend) {
                    const hasUnread = Object.values(state.dmUnreadCounts).some((count) => count > 0);
                    return { activeDmFriend: null, hasNewDmMessage: hasUnread };
                }
                const nextUnreadCounts = { ...state.dmUnreadCounts };
                delete nextUnreadCounts[friend.id];
                const hasUnread = Object.values(nextUnreadCounts).some((count) => count > 0);
                return { activeDmFriend: friend, hasNewDmMessage: hasUnread, dmUnreadCounts: nextUnreadCounts };
            }),
            setHasNewDmMessage: (hasNew) => set({ hasNewDmMessage: hasNew }),
            incrementDmUnread: (friendId, amount = 1) => set((state) => {
                if (!friendId || amount <= 0) return state;
                const current = state.dmUnreadCounts[friendId] || 0;
                const nextUnreadCounts = {
                    ...state.dmUnreadCounts,
                    [friendId]: current + amount,
                };
                return {
                    dmUnreadCounts: nextUnreadCounts,
                    hasNewDmMessage: Object.values(nextUnreadCounts).some((count) => count > 0),
                };
            }),
            clearDmUnread: (friendId) => set((state) => {
                if (!friendId || !state.dmUnreadCounts[friendId]) return state;
                const nextUnreadCounts = { ...state.dmUnreadCounts };
                delete nextUnreadCounts[friendId];
                return {
                    dmUnreadCounts: nextUnreadCounts,
                    hasNewDmMessage: Object.values(nextUnreadCounts).some((count) => count > 0),
                };
            }),
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
                        m.id === messageId ? { ...m, content: newContent, isEdited: true } : m
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
                const newUnreadCounts = { ...state.dmUnreadCounts };
                delete newUnreadCounts[friendId];
                return {
                    friendList: state.friendList.filter(f => f.id !== friendId),
                    dmMessages: newDmMessages,
                    dmUnreadCounts: newUnreadCounts,
                    hasNewDmMessage: Object.values(newUnreadCounts).some((count) => count > 0),
                    activeDmFriend: state.activeDmFriend?.id === friendId ? null : state.activeDmFriend,
                };
            }),

            blockUser: (user) => set((state) => {
                if (!user.id) return state;

                const alreadyBlocked = state.blockedUsers.some(b => b.id === user.id);
                const blockedUsers = alreadyBlocked
                    ? state.blockedUsers
                    : [{
                        id: user.id,
                        username: user.username || 'User',
                        avatarSeed: user.avatarSeed || user.id,
                        avatarUrl: user.avatarUrl || null,
                        blockedAt: new Date().toISOString(),
                    }, ...state.blockedUsers];

                const friendRequestsReceived = { ...state.friendRequestsReceived };
                delete friendRequestsReceived[user.id];
                const newDmMessages = { ...state.dmMessages };
                delete newDmMessages[user.id];
                const newUnreadCounts = { ...state.dmUnreadCounts };
                delete newUnreadCounts[user.id];

                const updates: Partial<SessionState> = {
                    blockedUsers,
                    friendRequestsReceived,
                    friendRequestsSent: state.friendRequestsSent.filter(id => id !== user.id),
                    friendList: state.friendList.filter(f => f.id !== user.id),
                    dmMessages: newDmMessages,
                    dmUnreadCounts: newUnreadCounts,
                    hasNewDmMessage: Object.values(newUnreadCounts).some((count) => count > 0),
                    activeDmFriend: state.activeDmFriend?.id === user.id ? null : state.activeDmFriend,
                };

                if (state.partnerId === user.id) {
                    updates.currentRoomId = null;
                    updates.isInChat = false;
                    updates.partnerId = null;
                    updates.partnerName = null;
                    updates.partnerAvatarSeed = null;
                    updates.partnerAvatarUrl = null;
                    updates.partnerIsVerified = false;
                }

                return updates;
            }),

            unblockUser: (friendId) => set((state) => ({
                blockedUsers: state.blockedUsers.filter(b => b.id !== friendId),
            })),

            isUserBlocked: (friendId) => get().blockedUsers.some(b => b.id === friendId),

            addMatchToHistory: (match) => set((state) => {
                // Find existing match info to prevent stale data from overwriting recent updates
                const existingMatch = state.matchHistory.find(m => m.id === match.id);
                const existingFriend = state.friendList.find(f => f.id === match.id);

                const isDefaultName = (name: string | undefined | null) => !name || name === 'Stranger' || name === 'Anonymous' || name === 'Partner';

                // Prioritize the most "complete" data
                const finalMatch: MatchRecord = {
                    ...match,
                    username: !isDefaultName(match.username) ? match.username : (!isDefaultName(existingMatch?.username) ? existingMatch!.username : (!isDefaultName(existingFriend?.username) ? existingFriend!.username : match.username)),
                    avatarSeed: match.avatarSeed || existingMatch?.avatarSeed || existingFriend?.avatarSeed || match.avatarSeed,
                    avatarUrl: match.avatarUrl || existingMatch?.avatarUrl || existingFriend?.avatarUrl || match.avatarUrl
                };

                const filtered = state.matchHistory.filter(m => m.id !== match.id);
                const newHistory = [finalMatch, ...filtered].slice(0, 40);
                return { matchHistory: newHistory };
            }),

            addNotification: (notification) => set((state) => ({
                notifications: [notification, ...state.notifications].slice(0, 50)
            })),

            removeNotification: (id) => set((state) => ({
                notifications: state.notifications.filter(n => n.id !== id)
            })),

            clearNotifications: () => set({ notifications: [] }),

            updatePeerProfile: (peerId, profile) => set((state) => {
                const updates: Partial<SessionState> = {};
                let hasChanged = false;

                // 1. Update Friend List
                if (state.friendList.some(f => f.id === peerId)) {
                    updates.friendList = state.friendList.map(f =>
                        f.id === peerId ? {
                            ...f,
                            username: profile.username ?? f.username,
                            avatarSeed: profile.avatarSeed ?? f.avatarSeed,
                            avatarUrl: profile.avatarUrl !== undefined ? profile.avatarUrl : f.avatarUrl
                        } : f
                    );
                    hasChanged = true;
                }

                // 2. Update Active DM Friend
                if (state.activeDmFriend?.id === peerId) {
                    updates.activeDmFriend = {
                        ...state.activeDmFriend,
                        id: state.activeDmFriend.id, // keep ID
                        username: profile.username ?? state.activeDmFriend.username,
                        avatarSeed: profile.avatarSeed ?? state.activeDmFriend.avatarSeed,
                        avatarUrl: profile.avatarUrl !== undefined ? profile.avatarUrl : state.activeDmFriend.avatarUrl
                    };
                    hasChanged = true;
                }

                // 3. Update Match History
                if (state.matchHistory.some(m => m.id === peerId)) {
                    updates.matchHistory = state.matchHistory.map(m =>
                        m.id === peerId ? {
                            ...m,
                            username: profile.username ?? m.username,
                            avatarSeed: profile.avatarSeed ?? m.avatarSeed,
                            avatarUrl: profile.avatarUrl !== undefined ? profile.avatarUrl : m.avatarUrl
                        } : m
                    );
                    hasChanged = true;
                }

                // 4. Update Partner if currently chatting
                if (state.partnerId === peerId) {
                    updates.partnerName = profile.username ?? state.partnerName;
                    updates.partnerAvatarSeed = profile.avatarSeed ?? state.partnerAvatarSeed;
                    updates.partnerAvatarUrl = profile.avatarUrl !== undefined ? profile.avatarUrl : state.partnerAvatarUrl;
                    hasChanged = true;
                }

                return hasChanged ? updates : state;
            }),
        }),
        {
            name: 'buzzu-session',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                peerId: state.peerId,
                deviceId: state.deviceId,
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
                bannerType: state.bannerType,
                bannerColor: state.bannerColor,
                bannerGradient: state.bannerGradient,
                friendRequestsSent: state.friendRequestsSent,
                friendRequestsReceived: state.friendRequestsReceived,
                friendList: state.friendList,
                blockedUsers: state.blockedUsers,
                activeDmFriend: state.activeDmFriend,
                dmUnreadCounts: state.dmUnreadCounts,
                // Persist match/room state so it survives route changes (DM ↔ chat)
                currentRoomId: state.currentRoomId,
                isInChat: state.isInChat,
                partnerId: state.partnerId,
                partnerName: state.partnerName,
                partnerAvatarSeed: state.partnerAvatarSeed,
                partnerAvatarUrl: state.partnerAvatarUrl,
                partnerIsVerified: state.partnerIsVerified,
                matchHistory: state.matchHistory,
                notifications: state.notifications,
            }),
        }
    )
);
