import type { RuleEntry } from "./config.js";
import type { RuleId } from "./schema.js";

export const PRESET_NAMES = ["ctxmedic:recommended", "ctxmedic:strict"] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

/** Built-in shareable configs for `extends` (ADR-020). Keep `docs/rules/README.md` "Presets" in sync; a test checks it. */
export const PRESETS: Record<PresetName, { rules: Partial<Record<RuleId, RuleEntry>>; ignores?: string[] }> = {
  // Today's defaults, spelled out so a project can say it chose them.
  "ctxmedic:recommended": { rules: {} },
  // Stricter thresholds, and info-only rules raised to warnings. Rules that grade their own findings
  // (secrets, broken links, bloat) keep "on": forcing a severity would demote their critical findings.
  "ctxmedic:strict": {
    rules: {
      WARN_CONTEXT_BLOAT: ["on", { tokens: 2000 }],
      WARN_DUPLICATE_RULES: ["on", { similarity: 0.6 }],
      INFO_UNSUPPORTED_SYNTAX: "warning",
      INFO_UNUSED_DISABLE: "warning",
      FIN_CONTEXT_SNOWBALL: ["on", { steps: 25 }],
      FIN_CACHE_MISS: ["on", { minHitRatio: 0.5 }],
      FIN_MODEL_OVERKILL: ["on", { minSessions: 2 }],
    },
  },
};
