/**
 * voiceChatStore — Zustand store bridging Sidebar mic button ↔ ChatArea PC
 *
 * Mirrors the screenShareStore pattern:
 *   1. User clicks mic in Sidebar → store.requestStart()
 *   2. ChatArea listens to `pendingAction` and calls useVoiceChat.startMic(pc, sendOffer)
 *   3. useVoiceChat updates this store with the active stream
 *   4. Sidebar button reflects isMicOn state (green glow)
 */

import { create } from 'zustand';

export interface VoiceChatState {
    /** Whether the local user's microphone is active */
    isMicOn: boolean;
    /** Local mic audio stream */
    localAudioStream: MediaStream | null;
    /** Whether the remote peer's mic is active (signaled) */
    isPartnerMicOn: boolean;
    /** Pending action: ChatArea picks this up to trigger start/stop on the PC */
    pendingAction: 'start' | 'stop' | null;

    // ── Actions ──
    requestStart: () => void;
    requestStop: () => void;
    clearPendingAction: () => void;
    setMicOn: (stream: MediaStream) => void;
    setMicOff: () => void;
    clearMic: () => void;
    setPartnerMicOn: (isOn: boolean) => void;
    reset: () => void;
}

export const useVoiceChatStore = create<VoiceChatState>((set) => ({
    isMicOn: false,
    localAudioStream: null,
    isPartnerMicOn: false,
    pendingAction: null,

    requestStart: () => set({ pendingAction: 'start' }),
    requestStop: () => set({ pendingAction: 'stop' }),
    clearPendingAction: () => set({ pendingAction: null }),

    setMicOn: (stream) => set({ isMicOn: true, localAudioStream: stream, pendingAction: null }),
    setMicOff: () => set({ isMicOn: false, pendingAction: null }),
    clearMic: () => set({ isMicOn: false, localAudioStream: null }),

    setPartnerMicOn: (isOn) => set({ isPartnerMicOn: isOn }),

    reset: () => set({
        isMicOn: false,
        localAudioStream: null,
        isPartnerMicOn: false,
        pendingAction: null,
    }),
}));
