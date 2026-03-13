import { evaluateBudgets, perfBudgets } from "./perfBudgets";

export type PerfSummary = {
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
};

export const computeSummary = (values: number[]): PerfSummary => {
  if (values.length === 0) {
    return { count: 0, min: 0, max: 0, avg: 0, p50: 0, p95: 0 };
  }
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    count: values.length,
    min,
    max,
    avg: sum / values.length,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
  };
};

export const createPerfStore = (limit = 2000) => {
  const store = new Map<string, number[]>();

  const record = (name: string, value: number) => {
    const list = store.get(name) ?? [];
    list.push(value);
    if (list.length > limit) {
      list.splice(0, list.length - limit);
    }
    store.set(name, list);
  };

  const snapshot = () => {
    const result: Record<string, PerfSummary> = {};
    for (const [name, values] of store.entries()) {
      result[name] = computeSummary(values);
    }
    return result;
  };

  const getRaw = (name: string) => store.get(name) ?? [];

  return { record, snapshot, getRaw };
};

export const initPerfMonitor = () => {
  if (typeof window === "undefined") return;

  const perfStore = createPerfStore();
  (window as any).__buzzuPerf = {
    record: perfStore.record,
    snapshot: perfStore.snapshot,
    getRaw: perfStore.getRaw,
  };

  const navEntries = performance.getEntriesByType("navigation");
  if (navEntries.length > 0) {
    const nav = navEntries[0] as PerformanceNavigationTiming;
    perfStore.record("nav.domContentLoaded", nav.domContentLoadedEventEnd);
    perfStore.record("nav.load", nav.loadEventEnd);
    perfStore.record("nav.ttfb", nav.responseStart);
  }

  let eventLoopTimer: number | null = null;
  let budgetTimer: number | null = null;
  let last = performance.now();
  eventLoopTimer = window.setInterval(() => {
    const now = performance.now();
    const drift = now - last - 1000;
    last = now;
    if (drift > 0) {
      perfStore.record("eventLoop.lag", drift);
    }
    const memory = (performance as any).memory;
    if (memory && typeof memory.usedJSHeapSize === "number") {
      perfStore.record("memory.usedHeapMb", memory.usedJSHeapSize / 1024 / 1024);
    }
  }, 1000);

  let longTaskObserver: PerformanceObserver | null = null;
  if ("PerformanceObserver" in window) {
    try {
      longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          perfStore.record("longtask.duration", entry.duration);
        });
      });
      longTaskObserver.observe({ entryTypes: ["longtask"] });
    } catch {
      longTaskObserver = null;
    }
  }

  budgetTimer = window.setInterval(() => {
    const snapshot = perfStore.snapshot();
    const violations = evaluateBudgets(snapshot, perfBudgets);
    if (violations.length > 0) {
      // console.warn("[PerfBudget]", { violations, snapshot });
    }
  }, 30000);

  return () => {
    if (eventLoopTimer) window.clearInterval(eventLoopTimer);
    if (budgetTimer) window.clearInterval(budgetTimer);
    if (longTaskObserver) longTaskObserver.disconnect();
  };
};
