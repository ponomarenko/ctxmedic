import { z } from "zod";

export const Severity = z.enum(["critical", "warning", "info"]);
export type Severity = z.infer<typeof Severity>;

export const RuleId = z.enum([
  "ERR_BROKEN_LINK",
  "WARN_CONTEXT_BLOAT",
  "WARN_DUPLICATE_RULES",
  "ERR_INVALID_SKILL",
  "CRIT_SECRET_LEAK",
  "INFO_UNSUPPORTED_SYNTAX",
  "FIN_BLOAT_IGNORE",
  "FIN_UNUSED_MCP",
  "FIN_MODEL_OVERKILL",
  "FIN_CONTEXT_SNOWBALL",
  "FIN_CACHE_MISS",
]);
export type RuleId = z.infer<typeof RuleId>;

export const FixOp = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("write"), path: z.string(), content: z.string() }),
  z.object({ kind: z.literal("symlink"), path: z.string(), target: z.string() }),
]);
export type FixOp = z.infer<typeof FixOp>;

export const FixPlan = z.object({ title: z.string(), ops: z.array(FixOp).min(1) });
export type FixPlan = z.infer<typeof FixPlan>;

export const Finding = z.object({
  ruleId: RuleId,
  severity: Severity,
  message: z.string(),
  files: z.array(z.string()).default([]),
  /** Raw lab values used by the clinical layer (token counts, ratios, $). */
  data: z.record(z.unknown()).default({}),
  monthlySavingsUsd: z.number().nonnegative().optional(),
  fix: FixPlan.optional(),
});
export type Finding = z.infer<typeof Finding>;

export const FileRole = z.enum(["instructions", "rules", "skill", "mcp", "ignore"]);
export type FileRole = z.infer<typeof FileRole>;

export const PathSet = z.object({
  project: z.array(z.string()).default([]),
  /** Paths starting with `~/` resolve from CTXMEDIC_HOME or the home dir. */
  global: z.array(z.string()).default([]),
});

export const HarnessProfile = z.object({
  id: z.string(),
  name: z.string(),
  contextLimit: z.number().int().positive(),
  files: z.object({
    instructions: PathSet,
    rules: PathSet.default({}),
    skill: PathSet.default({}),
    mcp: PathSet.default({}),
  }),
  /** Directives this harness understands: "@import", "alwaysApply", "globs", "applyTo", "trigger". */
  syntax: z.array(z.string()).default([]),
  ignoreFile: z.string().optional(),
  logs: z.array(z.string()).default([]),
});
export type HarnessProfile = z.infer<typeof HarnessProfile>;

export const ScannedFile = z.object({
  path: z.string(),
  rel: z.string(),
  scope: z.enum(["project", "global"]),
  role: FileRole,
  harnesses: z.array(z.string()),
  isSymlink: z.boolean(),
  linkTarget: z.string().optional(),
  broken: z.boolean(),
  loop: z.boolean().default(false),
  realpath: z.string().optional(),
  text: z.string().optional(),
  tokens: z.number().int().nonnegative(),
});
export type ScannedFile = z.infer<typeof ScannedFile>;

export const PatientVitals = z.object({
  root: z.string(),
  scannedAt: z.string(),
  filesScanned: z.number().int(),
  harnesses: z.array(z.string()),
  startupTokens: z.record(z.number()),
});
export type PatientVitals = z.infer<typeof PatientVitals>;

export const ModelUsage = z.object({
  model: z.string(),
  steps: z.number().int(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUsd: z.number(),
});
export type ModelUsage = z.infer<typeof ModelUsage>;

export const FinOpsReport = z.object({
  periodDays: z.number().int().positive(),
  sessions: z.number().int(),
  steps: z.number().int(),
  costUsd: z.number(),
  monthlyRunRateUsd: z.number(),
  cacheHitRatio: z.number().min(0).max(1).nullable(),
  byHarness: z.record(z.object({ sessions: z.number(), costUsd: z.number() })),
  byModel: z.array(ModelUsage),
  mcpCalls: z.record(z.number()),
  findings: z.array(Finding),
  potentialMonthlySavingsUsd: z.number(),
  pricingAsOf: z.string(),
});
export type FinOpsReport = z.infer<typeof FinOpsReport>;
