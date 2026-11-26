import { z } from "zod";
import { docsUrl, type RuleMeta } from "./types.js";

// Meta and options of the session-log detectors. The logic lives in `packages/finops`, which depends on core;
// the contract lives here so `loadConfig` validates every rule's options in one place (ADR-020).

export const MCP_SCHEMA_TOKENS = 1_500; // per server, when the logs do not record its tool definitions (ADR-018)
export const SNOWBALL_STEPS = 35;
export const SNOWBALL_HEAVY_STEPS = 10;
export const CACHE_HIT_MIN = 0.4;
export const CACHE_HIT_TARGET = 0.7;
export const CACHE_MIN_TOKENS = 1_000_000;
export const OVERKILL_MAX_STEPS = 2;
export const OVERKILL_MIN_SESSIONS = 3;

const posInt = (d: number) => z.number().int().positive().default(d);
const ratio = (d: number) => z.number().min(0).max(1).default(d);

export const FinOptions = {
  FIN_UNUSED_MCP: z.object({ schemaTokens: posInt(MCP_SCHEMA_TOKENS) }),
  FIN_MODEL_OVERKILL: z.object({ maxSteps: posInt(OVERKILL_MAX_STEPS), minSessions: posInt(OVERKILL_MIN_SESSIONS) }),
  FIN_CONTEXT_SNOWBALL: z.object({ steps: posInt(SNOWBALL_STEPS), heavySteps: posInt(SNOWBALL_HEAVY_STEPS) }),
  FIN_CACHE_MISS: z
    .object({ minHitRatio: ratio(CACHE_HIT_MIN), targetHitRatio: ratio(CACHE_HIT_TARGET), minTokens: posInt(CACHE_MIN_TOKENS) })
    .refine((o) => o.targetHitRatio >= o.minHitRatio, { message: "targetHitRatio must be at least minHitRatio" }),
};
export type FinId = keyof typeof FinOptions;
export type FinOptionsOf<K extends FinId> = z.infer<(typeof FinOptions)[K]>;

const meta = <K extends FinId>(id: K, description: string): RuleMeta<FinOptionsOf<K>> => ({
  description,
  type: "suggestion",
  docs: docsUrl(id),
  fixable: false,
  options: FinOptions[id] as unknown as z.ZodType<FinOptionsOf<K>>,
});

export const finopsMeta = {
  FIN_UNUSED_MCP: meta("FIN_UNUSED_MCP", "Remove MCP servers that are never called"),
  FIN_MODEL_OVERKILL: meta("FIN_MODEL_OVERKILL", "Route one-shot tasks to a cheaper model"),
  FIN_CONTEXT_SNOWBALL: meta("FIN_CONTEXT_SNOWBALL", "Compact or clear long sessions"),
  FIN_CACHE_MISS: meta("FIN_CACHE_MISS", "Keep the prompt cache warm"),
} satisfies { [K in FinId]: RuleMeta<FinOptionsOf<K>> };
