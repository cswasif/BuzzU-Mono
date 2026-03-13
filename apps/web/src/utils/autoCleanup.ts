export type MemorySnapshot = {
  usedMb?: number;
  totalMb?: number;
  limitMb?: number;
};

export type StorageSnapshot = {
  usageMb?: number;
  quotaMb?: number;
};

export type CleanupSnapshot = {
  memory: MemorySnapshot;
  storage: StorageSnapshot;
  domNodes: number;
  eventLoopLagP95?: number;
  longTaskP95?: number;
};

export type CleanupTrigger = {
  severity: "soft" | "hard";
  reasons: string[];
};

export type AutoCleanupConfig = {
  monitorIntervalMs: number;
  minCleanupIntervalMs: number;
  memorySoftRatio: number;
  memoryHardRatio: number;
  memorySoftMb: number;
  memoryHardMb: number;
  domSoft: number;
  domHard: number;
  storageSoftRatio: number;
  storageHardRatio: number;
  eventLoopLagSoft: number;
  eventLoopLagHard: number;
  longTaskSoft: number;
  longTaskHard: number;
  staleDisconnectedMs: number;
  staleFailedMs: number;
  staleConnectingMs: number;
  sessionCachePrefix: string;
  maxCacheEntries: number;
};

export const defaultAutoCleanupConfig: AutoCleanupConfig = {
  monitorIntervalMs: 2000,
  minCleanupIntervalMs: 8000,
  memorySoftRatio: 0.7,
  memoryHardRatio: 0.85,
  memorySoftMb: 450,
  memoryHardMb: 650,
  domSoft: 3000,
  domHard: 6000,
  storageSoftRatio: 0.8,
  storageHardRatio: 0.9,
  eventLoopLagSoft: 120,
  eventLoopLagHard: 220,
  longTaskSoft: 120,
  longTaskHard: 220,
  staleDisconnectedMs: 20000,
  staleFailedMs: 8000,
  staleConnectingMs: 45000,
  sessionCachePrefix: "buzzu_chat_cache_",
  maxCacheEntries: 3,
};

export const getMemorySnapshot = (): MemorySnapshot => {
  const memory = (performance as any)?.memory;
  if (!memory) return {};
  const usedMb = typeof memory.usedJSHeapSize === "number" ? memory.usedJSHeapSize / 1024 / 1024 : undefined;
  const totalMb = typeof memory.totalJSHeapSize === "number" ? memory.totalJSHeapSize / 1024 / 1024 : undefined;
  const limitMb = typeof memory.jsHeapSizeLimit === "number" ? memory.jsHeapSizeLimit / 1024 / 1024 : undefined;
  return { usedMb, totalMb, limitMb };
};

export const getStorageSnapshot = (estimate?: StorageEstimate): StorageSnapshot => {
  if (!estimate) return {};
  const usageMb = typeof estimate.usage === "number" ? estimate.usage / 1024 / 1024 : undefined;
  const quotaMb = typeof estimate.quota === "number" ? estimate.quota / 1024 / 1024 : undefined;
  return { usageMb, quotaMb };
};

export const buildCleanupSnapshot = (storageEstimate?: StorageEstimate): CleanupSnapshot => {
  const perf = (window as any)?.__buzzuPerf?.snapshot?.();
  return {
    memory: getMemorySnapshot(),
    storage: getStorageSnapshot(storageEstimate),
    domNodes: typeof document === "undefined" ? 0 : document.getElementsByTagName("*").length,
    eventLoopLagP95: perf?.["eventLoop.lag"]?.p95,
    longTaskP95: perf?.["longtask.duration"]?.p95,
  };
};

const ratio = (value?: number, limit?: number) => {
  if (typeof value !== "number" || typeof limit !== "number" || limit <= 0) return undefined;
  return value / limit;
};

export const shouldTriggerCleanup = (
  snapshot: CleanupSnapshot,
  config: AutoCleanupConfig = defaultAutoCleanupConfig,
): CleanupTrigger | null => {
  const reasons: string[] = [];
  let severity: "soft" | "hard" = "soft";

  const memRatio = ratio(snapshot.memory.usedMb, snapshot.memory.limitMb);
  if (typeof memRatio === "number") {
    if (memRatio >= config.memoryHardRatio) {
      reasons.push("memory.hard");
      severity = "hard";
    } else if (memRatio >= config.memorySoftRatio) {
      reasons.push("memory.soft");
    }
  } else if (typeof snapshot.memory.usedMb === "number") {
    if (snapshot.memory.usedMb >= config.memoryHardMb) {
      reasons.push("memory.hard");
      severity = "hard";
    } else if (snapshot.memory.usedMb >= config.memorySoftMb) {
      reasons.push("memory.soft");
    }
  }

  if (snapshot.domNodes >= config.domHard) {
    reasons.push("dom.hard");
    severity = "hard";
  } else if (snapshot.domNodes >= config.domSoft) {
    reasons.push("dom.soft");
  }

  const storageRatio = ratio(snapshot.storage.usageMb, snapshot.storage.quotaMb);
  if (typeof storageRatio === "number") {
    if (storageRatio >= config.storageHardRatio) {
      reasons.push("storage.hard");
      severity = "hard";
    } else if (storageRatio >= config.storageSoftRatio) {
      reasons.push("storage.soft");
    }
  }

  if (typeof snapshot.eventLoopLagP95 === "number") {
    if (snapshot.eventLoopLagP95 >= config.eventLoopLagHard) {
      reasons.push("eventLoop.hard");
      severity = "hard";
    } else if (snapshot.eventLoopLagP95 >= config.eventLoopLagSoft) {
      reasons.push("eventLoop.soft");
    }
  }

  if (typeof snapshot.longTaskP95 === "number") {
    if (snapshot.longTaskP95 >= config.longTaskHard) {
      reasons.push("longTask.hard");
      severity = "hard";
    } else if (snapshot.longTaskP95 >= config.longTaskSoft) {
      reasons.push("longTask.soft");
    }
  }

  if (reasons.length === 0) return null;
  return { severity, reasons };
};

const isMediaStreamLike = (value: any): value is MediaStream => {
  return value && typeof value.getTracks === "function";
};

export const cleanupOrphanedMediaElements = () => {
  if (typeof document === "undefined") return 0;
  let cleaned = 0;
  const nodes = document.querySelectorAll("video, audio");
  nodes.forEach((node) => {
    const media = node as HTMLMediaElement;
    const stream = media.srcObject;
    if (!isMediaStreamLike(stream)) return;
    const tracks = stream.getTracks();
    const hasLive = tracks.some((t) => t.readyState === "live");
    const isDetached = !document.body.contains(media);
    if (!hasLive || isDetached) {
      media.srcObject = null;
      cleaned += 1;
    }
  });
  return cleaned;
};

export const pruneSessionCache = (
  prefix: string,
  activeKey: string | null,
  maxEntries: number,
) => {
  if (typeof sessionStorage === "undefined") return 0;
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  const filtered = keys.filter((k) => (activeKey ? k !== `${prefix}${activeKey}` : true));
  let removed = 0;
  if (filtered.length > maxEntries) {
    const toRemove = filtered.slice(0, filtered.length - maxEntries);
    toRemove.forEach((key) => {
      sessionStorage.removeItem(key);
      removed += 1;
    });
  }
  return removed;
};

export type StalePeerInfo = {
  peerId: string;
  reason: "failed" | "disconnected" | "connecting";
};

export const getStalePeers = (
  peerConnections: Map<string, RTCPeerConnection>,
  getConnectionState: (peerId: string) => { type: string; timestamp?: number; startTime?: number },
  now: number,
  config: AutoCleanupConfig = defaultAutoCleanupConfig,
): StalePeerInfo[] => {
  const stale: StalePeerInfo[] = [];
  for (const [peerId, pc] of peerConnections.entries()) {
    if (pc.connectionState === "closed") continue;
    const state = getConnectionState(peerId);
    if (state.type === "failed" && typeof state.timestamp === "number") {
      if (now - state.timestamp >= config.staleFailedMs) {
        stale.push({ peerId, reason: "failed" });
      }
    } else if (state.type === "disconnected" && typeof state.timestamp === "number") {
      if (now - state.timestamp >= config.staleDisconnectedMs) {
        stale.push({ peerId, reason: "disconnected" });
      }
    } else if (state.type === "connecting" && typeof state.startTime === "number") {
      if (now - state.startTime >= config.staleConnectingMs) {
        stale.push({ peerId, reason: "connecting" });
      }
    }
  }
  return stale;
};
