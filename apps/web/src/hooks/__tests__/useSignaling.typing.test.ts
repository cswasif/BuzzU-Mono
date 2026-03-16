import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSignaling } from "../useSignaling";

const sendMessage = vi.fn();
const messageHandlers = new Map<string, Set<(msg: any) => void>>();
const onMessage = vi.fn((type: string, callback: (msg: any) => void) => {
  const set = messageHandlers.get(type) ?? new Set<(msg: any) => void>();
  set.add(callback);
  messageHandlers.set(type, set);
  return () => {
    const current = messageHandlers.get(type);
    current?.delete(callback);
  };
});

const emit = (type: string, msg: any) => {
  const handlers = messageHandlers.get(type);
  if (!handlers) return;
  handlers.forEach((cb) => cb(msg));
};

vi.mock("../../context/SignalingContext", () => ({
  useSignalingContext: () => ({
    sendMessage,
    onMessage,
    isConnected: true,
  }),
}));

vi.mock("../../stores/sessionStore", () => ({
  useSessionStore: Object.assign(
    () => ({
      peerId: "peer_local",
      avatarSeed: "seed_local",
    }),
    {
      getState: () => ({ avatarUrl: null }),
    },
  ),
}));

describe("useSignaling typing dedupe", () => {
  beforeEach(() => {
    vi.useRealTimers();
    sendMessage.mockClear();
    onMessage.mockClear();
    messageHandlers.clear();
  });

  it("sends typing transitions only when state changes for same target", () => {
    const { result } = renderHook(() => useSignaling());

    act(() => {
      result.current.sendTypingState("peer_remote", true);
      result.current.sendTypingState("peer_remote", true);
      result.current.sendTypingState("peer_remote", false);
      result.current.sendTypingState("peer_remote", false);
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: "Typing",
      from: "peer_local",
      to: "peer_remote",
      typing: true,
    });
    expect(sendMessage.mock.calls[1][0]).toMatchObject({
      type: "Typing",
      from: "peer_local",
      to: "peer_remote",
      typing: false,
    });
  });

  it("tracks typing state independently per target", () => {
    const { result } = renderHook(() => useSignaling());

    act(() => {
      result.current.sendTypingState("peer_a", true);
      result.current.sendTypingState("peer_b", true);
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[0][0].to).toBe("peer_a");
    expect(sendMessage.mock.calls[1][0].to).toBe("peer_b");
  });

  it("dedupes repeated screen share state bursts within cooldown window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { result } = renderHook(() => useSignaling());

    act(() => {
      result.current.sendScreenShareState("peer_remote", true);
      result.current.sendScreenShareState("peer_remote", true);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: "ScreenShare",
      from: "peer_local",
      to: "peer_remote",
      sharing: true,
    });

    act(() => {
      vi.advanceTimersByTime(1300);
      result.current.sendScreenShareState("peer_remote", true);
    });

    expect(sendMessage).toHaveBeenCalledTimes(2);
  });

  it("dedupes repeated voice chat state bursts within cooldown window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    const { result } = renderHook(() => useSignaling());

    act(() => {
      result.current.sendVoiceChatState("peer_remote", false);
      result.current.sendVoiceChatState("peer_remote", false);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toMatchObject({
      type: "VoiceChat",
      from: "peer_local",
      to: "peer_remote",
      sharing: false,
    });
  });

  it("uses stable skipId for retry and cancels retry after SkipAck", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSignaling());

    act(() => {
      result.current.sendSkip("peer_remote", "skip");
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const firstMessage = sendMessage.mock.calls[0][0];
    expect(firstMessage.type).toBe("Skip");
    expect(firstMessage.skipId).toBeTruthy();

    act(() => {
      emit("SkipAck", {
        type: "SkipAck",
        from: "peer_remote",
        to: "peer_local",
        skipId: firstMessage.skipId,
      });
      vi.advanceTimersByTime(600);
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("ignores duplicate incoming Skip events for the same skipId", () => {
    const { result } = renderHook(() => useSignaling());
    const onPeerSkip = vi.fn();

    act(() => {
      result.current.onPeerSkip(onPeerSkip);
    });

    act(() => {
      emit("Skip", {
        type: "Skip",
        from: "peer_remote",
        to: "peer_local",
        reason: "skip",
        skipId: "skip_123",
      });
      emit("Skip", {
        type: "Skip",
        from: "peer_remote",
        to: "peer_local",
        reason: "skip",
        skipId: "skip_123",
      });
    });

    expect(onPeerSkip).toHaveBeenCalledTimes(1);
  });

  it("notifies all subscribers for the same event", () => {
    const { result } = renderHook(() => useSignaling());
    const first = vi.fn();
    const second = vi.fn();

    act(() => {
      result.current.onTyping(first);
      result.current.onTyping(second);
    });

    act(() => {
      emit("Typing", {
        type: "Typing",
        from: "peer_remote",
        to: "peer_local",
        typing: true,
      });
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(first).toHaveBeenCalledWith(true, "peer_remote");
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith(true, "peer_remote");
  });

  it("unsubscribes listeners independently", () => {
    const { result } = renderHook(() => useSignaling());
    const first = vi.fn();
    const second = vi.fn();
    let unsubscribeFirst: (() => void) | undefined;
    let unsubscribeSecond: (() => void) | undefined;

    act(() => {
      unsubscribeFirst = result.current.onPeerSkip(first);
      unsubscribeSecond = result.current.onPeerSkip(second);
    });

    act(() => {
      unsubscribeFirst?.();
      emit("Skip", {
        type: "Skip",
        from: "peer_remote",
        to: "peer_local",
        reason: "skip",
        skipId: "skip_unique_after_unsub",
      });
    });

    expect(first).toHaveBeenCalledTimes(0);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledWith("peer_remote", "skip");

    act(() => {
      unsubscribeSecond?.();
      emit("Skip", {
        type: "Skip",
        from: "peer_remote",
        to: "peer_local",
        reason: "skip",
        skipId: "skip_unique_after_both_unsub",
      });
    });

    expect(second).toHaveBeenCalledTimes(1);
  });
});
