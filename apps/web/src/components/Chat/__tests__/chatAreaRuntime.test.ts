import { describe, expect, it, vi } from "vitest";
import {
  MAX_DATA_CHANNEL_CONTROL_MESSAGE_SIZE,
  createSafeSessionStorage,
  parseDataChannelControlMessage,
  toEncryptedBytes,
} from "../chatAreaRuntime";

describe("chatAreaRuntime", () => {
  describe("parseDataChannelControlMessage", () => {
    it("parses valid control messages", () => {
      expect(
        parseDataChannelControlMessage(
          JSON.stringify({ type: "delete_message", messageId: "m1" }),
        ),
      ).toEqual({ type: "delete_message", messageId: "m1" });
      expect(
        parseDataChannelControlMessage(
          JSON.stringify({
            type: "edit_message",
            messageId: "m2",
            content: "edited",
          }),
        ),
      ).toEqual({ type: "edit_message", messageId: "m2", content: "edited" });
      expect(
        parseDataChannelControlMessage(
          JSON.stringify({
            type: "chat_message",
            message: { id: "m3", content: "hello" },
          }),
        ),
      ).toEqual({
        type: "chat_message",
        message: { id: "m3", content: "hello" },
      });
      expect(
        parseDataChannelControlMessage(
          JSON.stringify({ type: "skip_signal", at: 123 }),
        ),
      ).toEqual({ type: "skip_signal", at: 123 });
    });

    it("rejects invalid or oversized messages", () => {
      expect(parseDataChannelControlMessage("not-json")).toBeNull();
      expect(
        parseDataChannelControlMessage(
          JSON.stringify({ type: "delete_message", messageId: 1 }),
        ),
      ).toBeNull();
      expect(
        parseDataChannelControlMessage(
          "x".repeat(MAX_DATA_CHANNEL_CONTROL_MESSAGE_SIZE + 1),
        ),
      ).toBeNull();
    });
  });

  describe("toEncryptedBytes", () => {
    it("converts payload formats into Uint8Array", () => {
      expect(Array.from(toEncryptedBytes([1, 2, 3]))).toEqual([1, 2, 3]);
      expect(Array.from(toEncryptedBytes("[4,5,6]"))).toEqual([4, 5, 6]);
      expect(Array.from(toEncryptedBytes(new Uint8Array([7, 8])))).toEqual([7, 8]);
    });

    it("throws on invalid payload bytes", () => {
      expect(() => toEncryptedBytes([256])).toThrow();
      expect(() => toEncryptedBytes([-1])).toThrow();
      expect(() => toEncryptedBytes([1.5])).toThrow();
      expect(() => toEncryptedBytes({ bad: true })).toThrow();
    });
  });

  describe("createSafeSessionStorage", () => {
    it("reads and writes through a healthy storage object", () => {
      const backing = new Map<string, string>();
      const mockStorage = {
        getItem: (key: string) => backing.get(key) ?? null,
        setItem: (key: string, value: string) => backing.set(key, value),
        removeItem: (key: string) => backing.delete(key),
      } as unknown as Storage;
      const safe = createSafeSessionStorage(mockStorage);
      safe.setItem("k", "v");
      expect(safe.getItem("k")).toBe("v");
      safe.removeItem("k");
      expect(safe.getItem("k")).toBeNull();
    });

    it("fails safely when storage throws", () => {
      const throwingStorage = {
        getItem: vi.fn(() => {
          throw new Error("blocked");
        }),
        setItem: vi.fn(() => {
          throw new Error("blocked");
        }),
        removeItem: vi.fn(() => {
          throw new Error("blocked");
        }),
      } as unknown as Storage;
      const safe = createSafeSessionStorage(throwingStorage);
      expect(safe.getItem("x")).toBeNull();
      expect(() => safe.setItem("x", "1")).not.toThrow();
      expect(() => safe.removeItem("x")).not.toThrow();
    });
  });
});
