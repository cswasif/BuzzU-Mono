import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFileTransfer } from "../useFileTransfer";

describe("useFileTransfer duplicate metadata handling", () => {
  it("ignores duplicate metadata for an in-flight transfer and reconstructs intact payload", async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useFileTransfer({
        onComplete,
      }),
    );

    const metadata = JSON.stringify({
      type: "metadata",
      name: "image.webp",
      size: 4,
      mime: "image/webp",
    });
    const payload = new Uint8Array([1, 2, 3, 4]);

    act(() => {
      result.current.receiveChunk(metadata);
      result.current.receiveChunk(metadata);
      result.current.receiveChunk(payload.buffer);
      result.current.receiveChunk(JSON.stringify({ type: "done" }));
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    const receivedBlob = onComplete.mock.calls[0][0] as Blob;
    expect(receivedBlob.size).toBe(4);
    expect(receivedBlob.type).toBe("image/webp");
  });
});

describe("useFileTransfer send resilience", () => {
  it("retries once on transient data-channel network errors", async () => {
    const { result } = renderHook(() => useFileTransfer());
    let firstAttempt = true;

    const channel = {
      readyState: "open",
      bufferedAmount: 0,
      bufferedAmountLowThreshold: 0,
      send: vi.fn(() => {
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error("NetworkError: Failed to execute 'send' on 'RTCDataChannel'");
        }
      }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as RTCDataChannel;

    const file = new File([new Uint8Array([1, 2, 3, 4])], "photo.png", {
      type: "image/png",
    });

    await act(async () => {
      await result.current.sendFile(channel, file);
    });

    expect(channel.send).toHaveBeenCalled();
    expect((channel.send as any).mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});
