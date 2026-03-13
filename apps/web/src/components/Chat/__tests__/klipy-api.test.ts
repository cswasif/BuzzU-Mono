import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { KlipyApi } from "../klipy/klipy-api";

describe("KlipyApi logging", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ results: [], next: "" }),
    } as any);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("redacts key and client_key in search log output", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const api = new KlipyApi({
      apiKey: "SECRET_API_KEY",
      clientKey: "SECRET_CLIENT_KEY",
      country: "US",
      locale: "en_US",
      contentFilter: "off",
    });

    await api.search("test");

    const searchLog = consoleSpy.mock.calls.find(
      (call) => call[0] === "[Klipy API] Searching for:",
    );
    expect(searchLog).toBeDefined();

    const loggedUrl = String(searchLog?.[3] ?? "");
    expect(loggedUrl).toContain("key=%5Bredacted%5D");
    expect(loggedUrl).toContain("client_key=%5Bredacted%5D");
    expect(loggedUrl).not.toContain("SECRET_API_KEY");
    expect(loggedUrl).not.toContain("SECRET_CLIENT_KEY");

    const fetchedUrl = String((global.fetch as any).mock.calls[0][0]);
    expect(fetchedUrl).toContain("key=SECRET_API_KEY");
    expect(fetchedUrl).toContain("client_key=SECRET_CLIENT_KEY");
  });
});
