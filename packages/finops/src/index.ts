import { applyConfig, FinOpsReport, findFiles, type CtxmedicConfig, type ScannedFile } from "@ctxmedic/core";
import { cachedParse, loadCache, saveCache } from "./cache.js";
import { detectors } from "./detectors.js";
import { LOG_SOURCES, type SessionStats } from "./parsers.js";
import { PRICING_AS_OF, priceOf } from "./pricing.js";

export * from "./pricing.js";
export * from "./parsers.js";
export * from "./detectors.js";
export * from "./cache.js";

export interface AnalyzeOptions {
  days?: number;
  root: string;
  files: ScannedFile[];
  now?: Date;
  /** Levels, `ignores` and inline disables from `ctxmedic.config.json` (`examine().config`). */
  config?: CtxmedicConfig;
}

export async function loadSessions(days: number, now = new Date()): Promise<SessionStats[]> {
  const cache = loadCache();
  const all: SessionStats[] = [];
  for (const src of LOG_SOURCES) {
    const paths = await findFiles(src.glob);
    all.push(...(await cachedParse(paths, src.parse, cache)).stats);
  }
  // Drop cache entries for deleted logs so the cache cannot grow forever.
  const live = new Set(all.map((s) => s.file));
  for (const k of Object.keys(cache.files)) if (!live.has(k)) delete cache.files[k];
  saveCache(cache);
  const since = new Date(now.getTime() - days * 86_400_000).toISOString();
  return all.filter((s) => (s.end ?? "") >= since);
}

export function buildReport(sessions: SessionStats[], { days = 30, root, files, config }: AnalyzeOptions): FinOpsReport {
  const byModel = new Map<string, { model: string; steps: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; costUsd: number; estimated: boolean }>();
  const byHarness: Record<string, { sessions: number; costUsd: number }> = {};
  const mcpCalls: Record<string, number> = {};
  let cost = 0;
  let steps = 0;
  let input = 0;
  let read = 0;
  for (const s of sessions) {
    const h = (byHarness[s.harness] ??= { sessions: 0, costUsd: 0 });
    h.sessions++;
    steps += s.steps;
    for (const [k, n] of Object.entries(s.mcpCalls)) mcpCalls[k] = (mcpCalls[k] ?? 0) + n;
    for (const [model, u] of Object.entries(s.models)) {
      const m = byModel.get(model) ?? { model, steps: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, estimated: priceOf(model).estimated };
      m.steps += u.steps;
      m.inputTokens += u.input;
      m.outputTokens += u.output;
      m.cacheReadTokens += u.cacheRead;
      m.cacheWriteTokens += u.cacheWrite;
      m.costUsd += u.costUsd;
      byModel.set(model, m);
      h.costUsd += u.costUsd;
      cost += u.costUsd;
      input += u.input + u.cacheWrite;
      read += u.cacheRead;
    }
  }
  const raw = detectors.flatMap((d) => d({ sessions, days, files, root }));
  // shortcut: FIN_* detectors take no options yet (thresholds are constants), until they become core-style rules.
  const findings = config ? applyConfig(raw, files, config) : raw;
  return FinOpsReport.parse({
    periodDays: days,
    sessions: sessions.length,
    steps,
    costUsd: cost,
    monthlyRunRateUsd: (cost * 30) / days,
    cacheHitRatio: input + read ? read / (input + read) : null,
    byHarness,
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    mcpCalls,
    findings,
    potentialMonthlySavingsUsd: findings.reduce((n, f) => n + (f.monthlySavingsUsd ?? 0), 0),
    pricingAsOf: PRICING_AS_OF,
  });
}

export async function analyze(opts: AnalyzeOptions): Promise<FinOpsReport> {
  const days = opts.days ?? 30;
  return buildReport(await loadSessions(days, opts.now), { ...opts, days });
}
