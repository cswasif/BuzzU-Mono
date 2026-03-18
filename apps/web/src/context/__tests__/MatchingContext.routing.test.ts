import { describe, it, expect } from "vitest";
import {
  buildMatchmakerWsUrl,
  buildMatchmakerSearchMessage,
  shouldSuppressAudioPlayError,
} from "../MatchingContext";

describe("MatchingContext routing URL", () => {
  it("includes peer, chat mode, and region query params", () => {
    const url = buildMatchmakerWsUrl({
      baseUrl: "wss://match.example.dev",
      peerId: "peer_abc",
      chatMode: "video",
      selectedInstitution: "bracu",
    });
    expect(url).toContain("peer_id=peer_abc");
    expect(url).toContain("chat_mode=video");
    expect(url).toContain("region=bracu");
  });

  it("sanitizes and bounds routing params", () => {
    const url = buildMatchmakerWsUrl({
      baseUrl: "wss://match.example.dev",
      peerId: "peer_xyz",
      chatMode: "Video / HD",
      selectedInstitution: "###",
    });
    expect(url).toContain("chat_mode=video-hd");
    expect(url).toContain("region=global");
  });

  it("builds Search payload with blocked peer ids", () => {
    const payload = buildMatchmakerSearchMessage({
      interests: ["music", "coding"],
      matchWithInterests: true,
      interestTimeoutSec: 30,
      gender: "M",
      genderFilter: "both",
      isVerified: true,
      verifiedOnly: false,
      chatMode: "video",
      deviceId: "device_1",
      tabId: "tab_1",
      blockedPeerIds: ["peer_a", "peer_b"],
    });
    expect(payload.type).toBe("Search");
    expect(payload.blocked_peer_ids).toEqual(["peer_a", "peer_b"]);
    expect(payload.chat_mode).toBe("video");
    expect(payload.with_interests).toBe(true);
    expect(payload.interest_timeout).toBe(30);
  });

  it("builds Search payload with empty block list", () => {
    const payload = buildMatchmakerSearchMessage({
      interests: [],
      matchWithInterests: true,
      interestTimeoutSec: 10,
      gender: "",
      genderFilter: "both",
      isVerified: false,
      verifiedOnly: false,
      chatMode: "text",
      deviceId: "",
      tabId: "",
      blockedPeerIds: [],
    });
    expect(payload.blocked_peer_ids).toEqual([]);
    expect(payload.type).toBe("Search");
  });

  it("disables interest matching and clamps timeout bounds", () => {
    const payload = buildMatchmakerSearchMessage({
      interests: ["music"],
      matchWithInterests: false,
      interestTimeoutSec: 9999,
      gender: "M",
      genderFilter: "both",
      isVerified: false,
      verifiedOnly: false,
      chatMode: "text",
      deviceId: "d",
      tabId: "t",
      blockedPeerIds: [],
    });
    expect(payload.interests).toEqual([]);
    expect(payload.with_interests).toBe(false);
    expect(payload.interest_timeout).toBe(600);
  });

  it("suppresses expected autoplay audio errors", () => {
    const notAllowed = Object.assign(new Error("play blocked"), { name: "NotAllowedError" });
    const interrupted = new Error("The play() request was interrupted by a new load request.");
    const unknown = Object.assign(new Error("other"), { name: "InvalidStateError" });

    expect(shouldSuppressAudioPlayError(notAllowed)).toBe(true);
    expect(shouldSuppressAudioPlayError(interrupted)).toBe(true);
    expect(shouldSuppressAudioPlayError(unknown)).toBe(false);
  });
});
