import { useEffect, useRef } from "react";
import { useScreenShareStore } from "../stores/screenShareStore";
import { useSessionStore } from "../stores/sessionStore";
import {
  buildCleanupSnapshot,
  cleanupOrphanedMediaElements,
  defaultAutoCleanupConfig,
  getStalePeers,
  pruneSessionCache,
  shouldTriggerCleanup,
  type AutoCleanupConfig,
} from "../utils/autoCleanup";

type AutoCleanupOptions = {
  enabled: boolean;
  activeRoomId: string | null;
  getPeerConnections: () => Map<string, RTCPeerConnection>;
  getConnectionState: (peerId: string) => { type: string; timestamp?: number; startTime?: number };
  closePeerConnection: (peerId: string) => void;
  config?: Partial<AutoCleanupConfig>;
};

export const useAutoCleanup = ({
  enabled,
  activeRoomId,
  getPeerConnections,
  getConnectionState,
  closePeerConnection,
  config,
}: AutoCleanupOptions) => {
  const cleanupInFlightRef = useRef(false);
  const lastCleanupAtRef = useRef(0);
  const storageEstimateRef = useRef<StorageEstimate | undefined>(undefined);
  const cfgRef = useRef<AutoCleanupConfig>({ ...defaultAutoCleanupConfig, ...config });

  useEffect(() => {
    cfgRef.current = { ...defaultAutoCleanupConfig, ...config };
  }, [config]);

  useEffect(() => {
    if (!enabled || typeof navigator === "undefined") return;
    let cancelled = false;
    const updateEstimate = async () => {
      if (!navigator.storage?.estimate) return;
      try {
        const estimate = await navigator.storage.estimate();
        if (!cancelled) {
          storageEstimateRef.current = estimate;
        }
      } catch { }
    };
    updateEstimate();
    const timer = setInterval(updateEstimate, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      const cfg = cfgRef.current;
      if (cleanupInFlightRef.current) return;
      const snapshot = buildCleanupSnapshot(storageEstimateRef.current);
      const trigger = shouldTriggerCleanup(snapshot, cfg);
      if (!trigger) return;
      const now = Date.now();
      if (now - lastCleanupAtRef.current < cfg.minCleanupIntervalMs) return;
      cleanupInFlightRef.current = true;
      try {
        const cleanedMedia = cleanupOrphanedMediaElements();
        const ssState = useScreenShareStore.getState();
        if (ssState.isRemoteSharing && ssState.remoteStream) {
          const tracks = ssState.remoteStream.getTracks?.() ?? [];
          const hasLive = tracks.some((t) => t.readyState === "live");
          if (!hasLive) {
            useScreenShareStore.getState().clearRemoteSharing();
          }
        }
        const stalePeers = getStalePeers(getPeerConnections(), getConnectionState, now, cfg);
        stalePeers.forEach((peer) => closePeerConnection(peer.peerId));
        pruneSessionCache(cfg.sessionCachePrefix, activeRoomId, cfg.maxCacheEntries);
        lastCleanupAtRef.current = now;
        if (trigger.severity === "hard") {
          const { currentRoomId } = useSessionStore.getState();
          if (currentRoomId && currentRoomId !== activeRoomId) {
            pruneSessionCache(cfg.sessionCachePrefix, activeRoomId, 0);
          }
        }
      } finally {
        cleanupInFlightRef.current = false;
      }
    }, cfgRef.current.monitorIntervalMs);
    return () => clearInterval(interval);
  }, [enabled, activeRoomId, getPeerConnections, getConnectionState, closePeerConnection]);
};
