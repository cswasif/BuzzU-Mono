import { describe, it, expect } from "vitest";
import { computeSummary, createPerfStore } from "../perfMonitor";
import { evaluateBudgets } from "../perfBudgets";

describe("computeSummary", () => {
  it("computes summary stats", () => {
    const values = [10, 20, 30, 40, 50];
    const summary = computeSummary(values);
    expect(summary.count).toBe(5);
    expect(summary.min).toBe(10);
    expect(summary.max).toBe(50);
    expect(summary.avg).toBe(30);
    expect(summary.p50).toBe(30);
    expect(summary.p95).toBe(50);
  });

  it("handles empty input", () => {
    const summary = computeSummary([]);
    expect(summary.count).toBe(0);
    expect(summary.avg).toBe(0);
    expect(summary.p95).toBe(0);
  });
});

describe("createPerfStore", () => {
  it("records metrics with limit", () => {
    const store = createPerfStore(3);
    store.record("lag", 1);
    store.record("lag", 2);
    store.record("lag", 3);
    store.record("lag", 4);
    const raw = store.getRaw("lag");
    expect(raw.length).toBe(3);
    expect(raw[0]).toBe(2);
    expect(raw[2]).toBe(4);
  });
});

describe("evaluateBudgets", () => {
  it("returns violations when thresholds exceeded", () => {
    const summary = {
      "eventLoop.lag": { count: 3, min: 10, max: 300, avg: 150, p50: 150, p95: 260 },
    };
    const violations = evaluateBudgets(summary, [
      { metric: "eventLoop.lag", p95: 80, max: 200 },
    ]);
    expect(violations.length).toBe(2);
  });
});
