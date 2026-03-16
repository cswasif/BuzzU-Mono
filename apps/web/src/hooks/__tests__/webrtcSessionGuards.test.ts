import { describe, expect, it } from "vitest";
import {
  isStaleAnswerSession,
  isStaleIceSession,
  isStaleOfferSession,
} from "../webrtcSessionGuards";
import {
  shouldIgnoreDuplicateOfferSdp,
  shouldRecoverFromAnswerError,
  shouldReplayDataChannelState,
} from "../useWebRTC";

describe("webrtcSessionGuards", () => {
  it("detects stale offers only when incoming session is older", () => {
    expect(isStaleOfferSession(100, 200)).toBe(true);
    expect(isStaleOfferSession(200, 100)).toBe(false);
    expect(isStaleOfferSession(200, 200)).toBe(false);
    expect(isStaleOfferSession(undefined, 200)).toBe(false);
    expect(isStaleOfferSession(200, undefined)).toBe(false);
  });

  it("detects stale answers only when incoming session is older", () => {
    expect(isStaleAnswerSession(100, 200)).toBe(true);
    expect(isStaleAnswerSession(200, 100)).toBe(false);
    expect(isStaleAnswerSession(200, 200)).toBe(false);
    expect(isStaleAnswerSession(undefined, 200)).toBe(false);
    expect(isStaleAnswerSession(200, undefined)).toBe(false);
  });

  it("detects stale ICE candidates only when candidate session is older", () => {
    expect(isStaleIceSession(100, 200)).toBe(true);
    expect(isStaleIceSession(200, 100)).toBe(false);
    expect(isStaleIceSession(200, 200)).toBe(false);
    expect(isStaleIceSession(undefined, 200)).toBe(false);
    expect(isStaleIceSession(200, undefined)).toBe(false);
  });

  it("detects answer m-line mismatch errors for recovery", () => {
    const err = new Error(
      "Failed to set remote answer sdp: The order of m-lines in answer doesn't match order in offer. Rejecting answer.",
    );
    expect(shouldRecoverFromAnswerError(err)).toBe(true);
    expect(shouldRecoverFromAnswerError("another error")).toBe(false);
    expect(shouldRecoverFromAnswerError(undefined)).toBe(false);
  });

  it("ignores duplicated offer SDPs seen in a short window", () => {
    expect(shouldIgnoreDuplicateOfferSdp("sdp_a", "sdp_a", 1000, 7000)).toBe(true);
    expect(shouldIgnoreDuplicateOfferSdp("sdp_a", "sdp_a", 1000, 10001)).toBe(false);
    expect(shouldIgnoreDuplicateOfferSdp("sdp_a", "sdp_b", 1000, 2000)).toBe(false);
    expect(shouldIgnoreDuplicateOfferSdp(undefined, "sdp_b", 1000, 2000)).toBe(false);
  });

  it("replays only open or connecting data channels", () => {
    expect(shouldReplayDataChannelState("open")).toBe(true);
    expect(shouldReplayDataChannelState("connecting")).toBe(true);
    expect(shouldReplayDataChannelState("closing")).toBe(false);
    expect(shouldReplayDataChannelState("closed")).toBe(false);
  });
});
