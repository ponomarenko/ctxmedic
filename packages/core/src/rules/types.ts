import type { Finding, HarnessProfile, ScannedFile } from "../schema.js";
import type { StartupLoad } from "../vitals.js";

export interface RuleContext {
  root: string;
  files: ScannedFile[];
  profiles: HarnessProfile[];
  startup: Record<string, StartupLoad>;
}

export interface Rule {
  id: Finding["ruleId"];
  check(ctx: RuleContext): Finding[] | Promise<Finding[]>;
}

export const BLOAT_TOKENS = 3_500;
export const DUPLICATE_SIMILARITY = 0.75;
