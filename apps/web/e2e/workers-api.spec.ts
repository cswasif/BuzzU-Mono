import { test, expect } from "@playwright/test";

const SIGNALING_URL = "https://buzzu-signaling.buzzu.workers.dev";
const MATCHMAKER_URL = "https://buzzu-matchmaker.buzzu.workers.dev";
const REPUTATION_URL = "https://buzzu-reputation.buzzu.workers.dev";

test.describe("Worker API contracts", () => {
  test("signaling root exposes expected service banner", async ({ request }) => {
    const res = await request.get(`${SIGNALING_URL}/`);
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toContain("BuzzU Signaling Server v2.0");
  });

  test("signaling health endpoint returns stable shape", async ({ request }) => {
    const healthRes = await request.get(`${SIGNALING_URL}/health`);
    expect(healthRes.ok()).toBeTruthy();
    const health = await healthRes.json();
    expect(health.status).toBe("ok");
    expect(health.version).toBeTruthy();
    expect(typeof health.timestamp).toBe("number");
  });

  test("signaling cors/origin policy rejects null origin", async ({ request }) => {
    const res = await request.fetch(`${SIGNALING_URL}/ice-servers`, {
      method: "GET",
      headers: { Origin: "null" },
    });
    expect(res.status()).toBe(403);
  });

  test("matchmaker root returns either service payload or auth challenge", async ({ request }) => {
    const healthRes = await request.get(`${MATCHMAKER_URL}/`);
    expect([401, 403]).toContain(healthRes.status());
    const healthText = await healthRes.text();
    expect(healthText.toLowerCase()).toContain("auth");
  });

  test("matchmaker metrics endpoint is auth-protected or returns valid metrics JSON", async ({ request }) => {
    const res = await request.get(`${MATCHMAKER_URL}/metrics`);
    const shard = res.headers()["x-matchmaker-shard"];
    const contentType = res.headers()["content-type"] ?? "";
    const body = await res.text();

    if (res.status() === 200) {
      expect(contentType.toLowerCase()).toContain("application/json");
      const payload = JSON.parse(body);
      expect(payload).toHaveProperty("metrics");
      expect(payload).toHaveProperty("breaker");
      expect(payload).toHaveProperty("queueDepth");
      expect(payload).toHaveProperty("timestamp");
    } else {
      expect([401, 403]).toContain(res.status());
      expect(body.toLowerCase()).toContain("auth");
    }

    expect(body).not.toContain("BuzzU Matchmaker Server v2.0");
    if (shard !== undefined) {
      expect(shard.length).toBeGreaterThan(0);
    }
  });

  test("reputation worker rejects missing peer identifier", async ({ request }) => {
    const res = await request.get(`${REPUTATION_URL}/`);
    expect(res.status()).toBe(400);
    const body = await res.text();
    expect(body).toContain("Missing peer identifier");
  });

  test("reputation worker serves peer reputation payload", async ({ request }) => {
    const payloadRes = await request.get(`${REPUTATION_URL}/reputation/pw_peer_${Date.now()}`);
    expect(payloadRes.ok()).toBeTruthy();
    const payload = await payloadRes.json();
    expect(payload).toHaveProperty("peer_hash");
    expect(payload).toHaveProperty("trust_score");
    expect(payload).toHaveProperty("tier");
  });
});
