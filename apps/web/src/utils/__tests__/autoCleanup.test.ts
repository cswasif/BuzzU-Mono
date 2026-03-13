import { describe, it, expect, beforeEach } from "vitest";
import {
  cleanupOrphanedMediaElements,
  defaultAutoCleanupConfig,
  getStalePeers,
  pruneSessionCache,
  shouldTriggerCleanup,
  type CleanupSnapshot,
} from "../autoCleanup";

describe("shouldTriggerCleanup", () => {
  it("returns hard trigger on high memory ratio", () => {
    const snapshot: CleanupSnapshot = {
      memory: { usedMb: 900, limitMb: 1000 },
      storage: {},
      domNodes: 0,
    };
    const trigger = shouldTriggerCleanup(snapshot);
    expect(trigger?.severity).toBe("hard");
    expect(trigger?.reasons.length).toBeGreaterThan(0);
  });

  it("returns soft trigger on dom pressure", () => {
    const snapshot: CleanupSnapshot = {
      memory: {},
      storage: {},
      domNodes: defaultAutoCleanupConfig.domSoft + 1,
    };
    const trigger = shouldTriggerCleanup(snapshot);
    expect(trigger?.severity).toBe("soft");
    expect(trigger?.reasons.some((r) => r.startsWith("dom"))).toBe(true);
  });
});

describe("cleanupOrphanedMediaElements", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("detaches ended streams", () => {
    const video = document.createElement("video");
    const stream = {
      getTracks: () => [{ readyState: "ended" }],
    };
    (video as any).srcObject = stream;
    document.body.appendChild(video);
    const cleaned = cleanupOrphanedMediaElements();
    expect(cleaned).toBe(1);
    expect((video as any).srcObject).toBe(null);
  });
});

describe("pruneSessionCache", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("removes old cache entries", () => {
    sessionStorage.setItem("buzzu_chat_cache_a", "1");
    sessionStorage.setItem("buzzu_chat_cache_b", "2");
    sessionStorage.setItem("buzzu_chat_cache_c", "3");
    const removed = pruneSessionCache("buzzu_chat_cache_", "b", 1);
    expect(removed).toBe(1);
    expect(sessionStorage.getItem("buzzu_chat_cache_b")).toBe("2");
  });
});

describe("getStalePeers", () => {
  it("flags failed peers after threshold", () => {
    const pc = { connectionState: "failed" } as RTCPeerConnection;
    const map = new Map<string, RTCPeerConnection>([["peer-1", pc]]);
    const now = Date.now();
    const stale = getStalePeers(
      map,
      () => ({ type: "failed", timestamp: now - defaultAutoCleanupConfig.staleFailedMs - 10 }),
      now,
    );
    expect(stale.length).toBe(1);
    expect(stale[0].peerId).toBe("peer-1");
  });
});
