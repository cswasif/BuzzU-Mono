import { describe, it, expect } from "vitest";
import { computeSummary, createPerfStore } from "../perfMonitor";
import { evaluateBudgets } from "../perfBudgets";

describe("perf regression", () => {
  it("summarizes large samples within a loose time budget", () => {
    const values = Array.from({ length: 50000 }, (_, i) => (i % 200) + 1);
    const start = performance.now();
    const summary = computeSummary(values);
    const duration = performance.now() - start;
    expect(summary.count).toBe(values.length);
    expect(duration).toBeLessThan(300);
  });

  it("flags budget regressions on synthetic lag spikes", () => {
    const store = createPerfStore(200);
    for (let i = 0; i < 200; i += 1) {
      store.record("eventLoop.lag", i % 40 === 0 ? 260 : 30);
    }
    const summary = store.snapshot();
    const violations = evaluateBudgets(summary);
    expect(violations.length).toBeGreaterThan(0);
  });
});
