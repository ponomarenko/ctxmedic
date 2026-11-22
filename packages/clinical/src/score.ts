import type { Finding } from "@ctxmedic/core";

export const PENALTY = { critical: 25, warning: 8, info: 2 } as const;

/** 100 − Σ penalties, each rule capped at 2× its worst single penalty (ADR-012). */
export function healthScore(findings: Finding[]): number {
  const byRule = new Map<string, { sum: number; max: number }>();
  for (const f of findings) {
    const p = PENALTY[f.severity];
    const e = byRule.get(f.ruleId) ?? { sum: 0, max: 0 };
    e.sum += p;
    e.max = Math.max(e.max, p);
    byRule.set(f.ruleId, e);
  }
  let total = 0;
  for (const e of byRule.values()) total += Math.min(e.sum, e.max * 2);
  return Math.max(0, Math.min(100, 100 - total));
}

export function healthGain(findings: Finding[], f: Finding): number {
  return healthScore(findings.filter((x) => x !== f)) - healthScore(findings);
}
