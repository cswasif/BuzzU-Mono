import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSignaling } from "../useSignaling";

const sendMessage = vi.fn();
const onMessage = vi.fn(() => () => {});

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
    sendMessage.mockClear();
    onMessage.mockClear();
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
});
