import type { z } from "zod";
import type { Finding, HarnessProfile, ScannedFile } from "../schema.js";
import type { StartupLoad } from "../vitals.js";

export interface RuleContext {
  root: string;
  files: ScannedFile[];
  profiles: HarnessProfile[];
  startup: Record<string, StartupLoad>;
}

/** Describes a rule the way ESLint's `meta` does; `docs/rules/<id>.md` is the full page (ADR-020). */
export interface RuleMeta<O = Record<string, never>> {
  description: string;
  /** "problem": something is broken or leaks; "suggestion": it works but costs tokens or money. */
  type: "problem" | "suggestion";
  docs: string;
  /** True when some findings carry an auto-fix (`ctxmedic treat`). */
  fixable: boolean;
  /** Options a config may pass; defaults make `{}` valid. */
  options?: z.ZodType<O>;
}

export interface Rule<O = any> {
  id: Finding["ruleId"];
  meta: RuleMeta<O>;
  check(ctx: RuleContext, options: O): Finding[] | Promise<Finding[]>;
}

export const docsUrl = (id: Finding["ruleId"]) => `https://github.com/ponomarenko/ctxmedic/blob/main/docs/rules/${id}.md`;

export const BLOAT_TOKENS = 3_500;
export const DUPLICATE_SIMILARITY = 0.75;
