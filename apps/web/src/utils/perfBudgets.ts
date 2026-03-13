import type { PerfSummary } from "./perfMonitor";

export type PerfBudget = {
  metric: string;
  p95?: number;
  max?: number;
};

export const perfBudgets: PerfBudget[] = [
  { metric: "eventLoop.lag", p95: 80, max: 200 },
  { metric: "longtask.duration", p95: 80, max: 200 },
  { metric: "nav.domContentLoaded", p95: 3000, max: 6000 },
  { metric: "nav.load", p95: 5000, max: 9000 },
];

export const evaluateBudgets = (
  summary: Record<string, PerfSummary>,
  budgets: PerfBudget[] = perfBudgets,
) => {
  const violations: Array<{ metric: string; type: "p95" | "max"; value: number; limit: number }> = [];
  for (const budget of budgets) {
    const metric = summary[budget.metric];
    if (!metric) continue;
    if (typeof budget.p95 === "number" && metric.p95 > budget.p95) {
      violations.push({ metric: budget.metric, type: "p95", value: metric.p95, limit: budget.p95 });
    }
    if (typeof budget.max === "number" && metric.max > budget.max) {
      violations.push({ metric: budget.metric, type: "max", value: metric.max, limit: budget.max });
    }
  }
  return violations;
};
