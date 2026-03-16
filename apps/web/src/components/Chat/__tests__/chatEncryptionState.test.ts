import { describe, expect, it } from "vitest";
import { shouldMarkSignalReady } from "../chatEncryptionState";

describe("shouldMarkSignalReady", () => {
  it("returns true only when partner exists, crypto is ready, and session exists", () => {
    expect(
      shouldMarkSignalReady({
        partnerId: "peer_a",
        isCryptoReady: true,
        hasSignalSession: true,
      }),
    ).toBe(true);
    expect(
      shouldMarkSignalReady({
        partnerId: null,
        isCryptoReady: true,
        hasSignalSession: true,
      }),
    ).toBe(false);
    expect(
      shouldMarkSignalReady({
        partnerId: "peer_a",
        isCryptoReady: false,
        hasSignalSession: true,
      }),
    ).toBe(false);
    expect(
      shouldMarkSignalReady({
        partnerId: "peer_a",
        isCryptoReady: true,
        hasSignalSession: false,
      }),
    ).toBe(false);
  });
});
