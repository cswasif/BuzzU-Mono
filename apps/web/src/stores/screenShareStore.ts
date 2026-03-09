/**
 * screenShareStore — Zustand store bridging Sidebar button ↔ ChatArea PC
 *
 * The screen share button lives in the Sidebar (Discord-style user panel),
 * but the RTCPeerConnection lives in ChatArea. This store acts as the
 * event bus / shared state between them.
 *
 * Flow:
 *   1. User clicks screen share in Sidebar → store.requestStart()
 *   2. ChatArea listens to `pendingAction` and calls useScreenShare.startScreenShare(pc, sendOffer)
 *   3. useScreenShare updates this store with the active stream
 *   4. Sidebar button reflects isSharing state (green glow)
 */

import { create } from 'zustand';

export interface ScreenShareState {
  /** Whether local user is currently sharing */
  isLocalSharing: boolean;
  /** Local screen share stream (for preview / viewer) */
  localStream: MediaStream | null;
  /** Whether the remote peer is sharing their screen */
  isRemoteSharing: boolean;
  /** Remote screen share stream */
  remoteStream: MediaStream | null;
  /**
   * Monotonically increasing counter bumped on every setRemoteSharing call.
   * Zustand uses shallow equality (Object.is) for re-render checks. When
   * ICE recovers and we "nudge" the same stream object back into the store,
   * the reference hasn't changed so components don't re-render. Bumping
   * this counter forces ScreenShareViewer to pick up the change.
   */
  remoteStreamVersion: number;
  /** Pending action: ChatArea picks this up to trigger start/stop on the PC */
  pendingAction: 'start' | 'stop' | null;

  // ── Actions ──
  /** Called from Sidebar button to request screen share start */
  requestStart: () => void;
  /** Called from Sidebar button to request screen share stop */
  requestStop: () => void;
  /** Called from ChatArea after it processes the pending action */
  clearPendingAction: () => void;
  /** Called from useScreenShare hook when sharing starts */
  setLocalSharing: (stream: MediaStream) => void;
  /** Called from useScreenShare hook when sharing stops */
  clearLocalSharing: () => void;
  /** Called from useWebRTC ontrack when remote screen share detected */
  setRemoteSharing: (stream: MediaStream) => void;
  /** Called when remote screen share ends */
  clearRemoteSharing: () => void;
  /** Reset only remote sharing state (preserves local screen capture across skips) */
  resetRemoteOnly: () => void;
  /** Full reset (on disconnect / leave room) */
  reset: () => void;
}

export const useScreenShareStore = create<ScreenShareState>((set) => ({
  isLocalSharing: false,
  localStream: null,
  isRemoteSharing: false,
  remoteStream: null,
  remoteStreamVersion: 0,
  pendingAction: null,

  requestStart: () => set({ pendingAction: 'start' }),
  requestStop: () => set({ pendingAction: 'stop' }),
  clearPendingAction: () => set({ pendingAction: null }),

  setLocalSharing: (stream) => set({ isLocalSharing: true, localStream: stream, pendingAction: null }),
  clearLocalSharing: () => set({ isLocalSharing: false, localStream: null }),

  setRemoteSharing: (stream) => set((state) => ({
    isRemoteSharing: true,
    remoteStream: stream,
    remoteStreamVersion: state.remoteStreamVersion + 1,
  })),
  clearRemoteSharing: () => set({ isRemoteSharing: false, remoteStream: null }),

  resetRemoteOnly: () => set({
    isRemoteSharing: false,
    remoteStream: null,
    remoteStreamVersion: 0,
    pendingAction: null,
  }),

  reset: () => set({
    isLocalSharing: false,
    localStream: null,
    isRemoteSharing: false,
    remoteStream: null,
    remoteStreamVersion: 0,
    pendingAction: null,
  }),
}));
