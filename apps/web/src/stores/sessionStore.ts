import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface SessionState {
    // Identity
    peerId: string;
    displayName: string;
    isVerified: boolean;
    verifiedEmail: string | null;
    idToken: string | null;

    // Preferences
    interests: string[];
    gender: string; // 'M' | 'F' | 'U'
    genderFilter: string; // 'male' | 'female' | 'both'
    chatMode: 'video' | 'text';
    theme: 'dark' | 'light';

    // Session
    currentRoomId: string | null;
    isInChat: boolean;
    partnerId: string | null;

    // Actions
    initSession: () => void;
    setDisplayName: (name: string) => void;
    setInterests: (interests: string[]) => void;
    setGender: (gender: string) => void;
    setGenderFilter: (filter: string) => void;
    setChatMode: (mode: 'video' | 'text') => void;
    setTheme: (theme: 'dark' | 'light') => void;
    joinRoom: (roomId: string, partnerId: string) => void;
    leaveRoom: () => void;
    setVerified: (email: string, token: string) => void;
    resetSession: () => void;
}

function generatePeerId(): string {
    return `peer_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export const useSessionStore = create<SessionState>()(
    persist(
        (set, get) => ({
            // Initial state
            peerId: '',
            displayName: '',
            isVerified: false,
            verifiedEmail: null,
            idToken: null,
            interests: [],
            gender: 'U',
            genderFilter: 'both',
            chatMode: 'video',
            theme: 'dark',
            currentRoomId: null,
            isInChat: false,
            partnerId: null,

            // Actions
            initSession: () => {
                const state = get();
                if (!state.peerId) {
                    const id = generatePeerId();
                    set({
                        peerId: id,
                        displayName: `Anonymous ${id.substring(5, 13)}`,
                    });
                }
            },

            setDisplayName: (name) => set({ displayName: name }),
            setInterests: (interests) => set({ interests }),
            setGender: (gender) => set({ gender }),
            setGenderFilter: (filter) => set({ genderFilter: filter }),
            setChatMode: (mode) => set({ chatMode: mode }),
            setTheme: (theme) => set({ theme }),

            joinRoom: (roomId, partnerId) => set({
                currentRoomId: roomId,
                isInChat: true,
                partnerId,
            }),

            leaveRoom: () => set({
                currentRoomId: null,
                isInChat: false,
                partnerId: null,
            }),

            setVerified: (email, token) => set({
                isVerified: true,
                verifiedEmail: email,
                idToken: token,
            }),

            resetSession: () => set({
                peerId: generatePeerId(),
                displayName: '',
                isVerified: false,
                verifiedEmail: null,
                idToken: null,
                interests: [],
                gender: 'U',
                genderFilter: 'both',
                currentRoomId: null,
                isInChat: false,
                partnerId: null,
            }),
        }),
        {
            name: 'buzzu-session',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                peerId: state.peerId,
                displayName: state.displayName,
                interests: state.interests,
                gender: state.gender,
                genderFilter: state.genderFilter,
                chatMode: state.chatMode,
                theme: state.theme,
                // NOTE: isVerified, verifiedEmail, and idToken are intentionally excluded
                // They live in memory only and are cleared when the tab closes
                // This prevents forensic extraction of identity data
                // Per spec: "No emails, hashes, or user data are stored on any server"
            }),
        }
    )
);
