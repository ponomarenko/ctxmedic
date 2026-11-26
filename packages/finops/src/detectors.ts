import path from "node:path";
import { finopsMeta, mcpServers, type FinId, type FinOptionsOf, type Finding, type RuleMeta, type ScannedFile } from "@ctxmedic/core";
import { costOf, lighterModel, priceOf } from "./pricing.js";
import type { SessionStats } from "./parsers.js";

// Defaults now live with the options contract in core; re-exported for existing imports.
export {
  CACHE_HIT_MIN,
  CACHE_HIT_TARGET,
  CACHE_MIN_TOKENS,
  MCP_SCHEMA_TOKENS,
  OVERKILL_MAX_STEPS,
  OVERKILL_MIN_SESSIONS,
  SNOWBALL_HEAVY_STEPS,
  SNOWBALL_STEPS,
} from "@ctxmedic/core";

export interface DetectorInput {
  sessions: SessionStats[];
  days: number;
  files: ScannedFile[];
  root: string;
}

const monthly = (usd: number, days: number) => (usd * 30) / days;
const round = (n: number) => Math.round(n * 100) / 100;
const dominant = (sessions: SessionStats[]) => {
  const m: Record<string, number> = {};
  for (const s of sessions) for (const [k, u] of Object.entries(s.models)) m[k] = (m[k] ?? 0) + u.steps;
  return Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0];
};
const sev = (usd: number): Finding["severity"] => (usd >= 1 ? "warning" : "info");

/** A session-log rule: core holds its `meta` and options contract (`finopsMeta`), finops holds the check. */
export interface Detector<K extends FinId = FinId> {
  id: K;
  meta: RuleMeta<FinOptionsOf<K>>;
  check(input: DetectorInput, options: FinOptionsOf<K>): Finding[];
}
const detector = <K extends FinId>(id: K, check: Detector<K>["check"]): Detector<K> => ({ id, meta: finopsMeta[id] as RuleMeta<FinOptionsOf<K>>, check });

export const unusedMcp = detector("FIN_UNUSED_MCP", ({ sessions, days, files, root }, { schemaTokens: fallback }) => {
  const out: Finding[] = [];
  const calls: Record<string, number> = {};
  for (const s of sessions) for (const [k, n] of Object.entries(s.mcpCalls)) calls[k] = (calls[k] ?? 0) + n;
  for (const f of files) {
    if (f.role !== "mcp" || !f.text) continue;
    for (const hid of f.harnesses) {
      const hs = sessions.filter((s) => s.harness === hid);
      if (!hs.length) continue; // no evidence for this harness
      const steps = hs.reduce((n, s) => n + s.steps, 0);
      const model = dominant(hs) ?? "claude-sonnet-5-5";
      // One finding per config file: a list of idle servers reads better than one card each.
      const idle = Object.keys(mcpServers(f.path, f.text, root)).filter((name) => !calls[name] && !calls[name.replace(/[^\w]/g, "_")]);
      if (!idle.length) continue;
      // Real size from the logs when a session recorded the server's tool definitions (ADR-018).
      const measured = idle.map((name) => Math.max(0, ...hs.map((s) => s.mcpSchemaTokens?.[name] ?? s.mcpSchemaTokens?.[name.replace(/[^\w]/g, "_")] ?? 0)) || null);
      const schemaTokens = measured.reduce<number>((n, t) => n + (t ?? fallback), 0);
      const estimated = measured.some((t) => t === null);
      const usd = monthly((schemaTokens * steps * priceOf(model).price.cacheRead) / 1e6, days);
      out.push({
        ruleId: "FIN_UNUSED_MCP",
        severity: sev(usd),
        message: `${idle.length} MCP server(s) in ${f.rel} were called 0 times in ${days} days across ${steps.toLocaleString("en")} requests: ${idle.join(", ")}`,
        files: [f.rel],
        data: { server: idle.join(", "), harness: hid, scope: f.scope, steps, schemaTokens, estimated, days },
        monthlySavingsUsd: round(usd),
      });
    }
  }
  return out;
});

export const modelOverkill = detector("FIN_MODEL_OVERKILL", ({ sessions, days }, { maxSteps, minSessions }) => {
  const byModel = new Map<string, { n: number; cost: number; cheaper: number; to: string }>();
  for (const s of sessions) {
    if (s.steps === 0 || s.steps > maxSteps) continue;
    for (const [model, u] of Object.entries(s.models)) {
      const to = lighterModel(model);
      if (!to) continue;
      const e = byModel.get(model) ?? { n: 0, cost: 0, cheaper: 0, to };
      e.n++;
      e.cost += u.costUsd;
      e.cheaper += costOf(to, u);
      byModel.set(model, e);
    }
  }
  return [...byModel]
    .filter(([, e]) => e.n >= minSessions)
    .map(([model, e]) => {
      const usd = monthly(e.cost - e.cheaper, days);
      return {
        ruleId: "FIN_MODEL_OVERKILL" as const,
        severity: sev(usd),
        message: `${e.n} one-shot sessions ran on ${model}; ${e.to} would handle them`,
        files: [],
        data: { model, suggested: e.to, sessions: e.n, costUsd: round(e.cost), days },
        monthlySavingsUsd: round(usd),
      };
    });
});

export const contextSnowball = detector("FIN_CONTEXT_SNOWBALL", ({ sessions, days }, { steps, heavySteps }) => {
  const bad = sessions.filter((s) => s.steps > steps && s.heavySteps >= heavySteps && s.compactions === 0);
  if (!bad.length) return [];
  let usd = 0;
  for (const s of bad) {
    const model = Object.keys(s.models)[0] ?? "claude-sonnet-5-5";
    usd += (s.heavyExcessTokens * priceOf(model).price.cacheRead) / 1e6;
  }
  usd = monthly(usd, days);
  const worst = [...bad].sort((a, b) => b.heavyExcessTokens - a.heavyExcessTokens)[0]!;
  return [
    {
      ruleId: "FIN_CONTEXT_SNOWBALL",
      severity: sev(usd),
      message: `${bad.length} session(s) ran >${steps} steps with 100k+ context and no /clear or /compact`,
      files: bad.slice(0, 5).map((s) => `session ${path.basename(s.file, ".jsonl")}`),
      data: { sessions: bad.length, worstSteps: worst.steps, worstMaxContext: worst.maxContext, days },
      monthlySavingsUsd: round(usd),
    },
  ];
});

export const cacheMiss = detector("FIN_CACHE_MISS", ({ sessions, days }, { minHitRatio, targetHitRatio, minTokens }) => {
  const out: Finding[] = [];
  for (const h of ["claude-code", "codex"] as const) {
    const hs = sessions.filter((s) => s.harness === h);
    let input = 0;
    let read = 0;
    let write = 0;
    for (const s of hs) for (const u of Object.values(s.models)) (input += u.input), (read += u.cacheRead), (write += u.cacheWrite);
    const total = input + read + write;
    if (total < minTokens) continue;
    const ratio = read / total;
    if (ratio >= minHitRatio) continue;
    const p = priceOf(dominant(hs) ?? "claude-sonnet-5-5").price;
    const usd = monthly(((targetHitRatio - ratio) * total * (p.input - p.cacheRead)) / 1e6, days);
    out.push({
      ruleId: "FIN_CACHE_MISS",
      severity: sev(usd),
      message: `${h} prompt-cache hit ratio is ${Math.round(ratio * 100)}% (healthy: ≥${Math.round(minHitRatio * 100)}%)`,
      files: [],
      data: { harness: h, cacheHitRatio: ratio, totalInputTokens: total, days },
      monthlySavingsUsd: round(Math.max(0, usd)),
    });
  }
  return out;
});

export const detectors: Detector[] = [unusedMcp, modelOverkill, contextSnowball, cacheMiss] as Detector[];
