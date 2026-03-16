import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

const durationSec = Number(process.env.DURATION_SEC || "20");
const concurrency = Number(process.env.CONCURRENCY || "10");
const timeoutMs = Number(process.env.TIMEOUT_MS || "8000");

const toHttpBase = (url) => {
  if (!url) return "";
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
};

const signalingBase =
  process.env.SIGNALING_HTTP_URL ||
  toHttpBase(process.env.SIGNALING_URL) ||
  "https://buzzu-signaling.md-wasif-faisal.workers.dev";

const reputationBase = process.env.REPUTATION_URL || "";
const matchmakerBase = process.env.MATCHMAKER_HTTP_URL || toHttpBase(process.env.MATCHMAKER_URL);
const matchmakerToken = process.env.MATCHMAKER_TOKEN || "";
const enableReputationWrites = process.env.ENABLE_REPUTATION_WRITES === "1";

const targets = [
  {
    name: "signaling-health",
    method: "GET",
    url: `${signalingBase}/health`,
  },
];

if (reputationBase) {
  const peerHash = "deadbeef";
  targets.push({
    name: "reputation-get",
    method: "GET",
    url: `${reputationBase}/reputation/${peerHash}`,
  });
  if (enableReputationWrites) {
    targets.push({
      name: "reputation-report",
      method: "POST",
      url: `${reputationBase}/reputation/report?target=bbbb`,
      bodyFactory: () =>
        JSON.stringify({
          reporter_hash: `aaaa_${Math.random().toString(36).slice(2, 8)}`,
          target_hash: "bbbb",
          reason: "load-test",
          details: "synthetic",
        }),
      headers: { "Content-Type": "application/json" },
    });
  }
}

if (matchmakerBase && matchmakerToken) {
  targets.push({
    name: "matchmaker-get",
    method: "GET",
    url: `${matchmakerBase}/match?peer_id=loadtest`,
    headers: { Cookie: `token=${matchmakerToken}` },
  });
}

const stopAt = performance.now() + durationSec * 1000;
const stats = new Map();

const record = (name, ms, ok) => {
  if (!stats.has(name)) {
    stats.set(name, { latencies: [], ok: 0, fail: 0 });
  }
  const entry = stats.get(name);
  entry.latencies.push(ms);
  if (ok) entry.ok += 1;
  else entry.fail += 1;
};

const fetchWithTimeout = async (url, init) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const runTarget = async (target) => {
  while (performance.now() < stopAt) {
    const start = performance.now();
    try {
      const body = target.bodyFactory ? target.bodyFactory() : target.body;
      const res = await fetchWithTimeout(target.url, {
        method: target.method,
        headers: target.headers,
        body,
      });
      const ok = res.ok;
      if (target.method !== "GET") {
        await res.text();
      }
      record(target.name, performance.now() - start, ok);
    } catch {
      record(target.name, performance.now() - start, false);
    }
    await sleep(10);
  }
};

const quantile = (arr, q) => {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
};

const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();

const workers = [];
for (let i = 0; i < concurrency; i += 1) {
  const target = targets[i % targets.length];
  workers.push(runTarget(target));
}

await Promise.all(workers);
lag.disable();

for (const [name, entry] of stats.entries()) {
  const p50 = quantile(entry.latencies, 0.5).toFixed(1);
  const p95 = quantile(entry.latencies, 0.95).toFixed(1);
  const max = Math.max(0, ...entry.latencies).toFixed(1);
  const total = entry.ok + entry.fail;
  console.log(
    `${name} total=${total} ok=${entry.ok} fail=${entry.fail} p50=${p50}ms p95=${p95}ms max=${max}ms`,
  );
}

const memory = process.memoryUsage();
console.log(
  `memory rss=${Math.round(memory.rss / 1024 / 1024)}MB heapUsed=${Math.round(
    memory.heapUsed / 1024 / 1024,
  )}MB`,
);
console.log(
  `eventLoopLag mean=${Math.round(lag.mean / 1e6)}ms p99=${Math.round(
    lag.percentile(99) / 1e6,
  )}ms max=${Math.round(lag.max / 1e6)}ms`,
);
