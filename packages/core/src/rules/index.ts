import { Finding } from "../schema.js";
import { bloatIgnore } from "./bloatIgnore.js";
import { brokenLink } from "./brokenLink.js";
import { contextBloat } from "./contextBloat.js";
import { duplicates } from "./duplicates.js";
import { secretLeak } from "./secretLeak.js";
import { skills } from "./skills.js";
import { syntax } from "./syntax.js";
import { finopsMeta } from "./finopsMeta.js";
import { docsUrl, type Rule, type RuleContext, type RuleMeta } from "./types.js";

export * from "./types.js";
export * from "./finopsMeta.js";
export { similarity } from "./duplicates.js";

export const rules: Rule[] = [brokenLink, contextBloat, duplicates, skills, secretLeak, syntax, bloatIgnore];

/** Reported by `applyConfig`, not by a check of its own, so it has meta but no `Rule` object. */
export const unusedDisableMeta: RuleMeta = {
  description: "Remove ctxmedic-disable comments that silence nothing",
  type: "suggestion",
  docs: docsUrl("INFO_UNUSED_DISABLE"),
  fixable: false,
};

/** Every configurable rule id (built-in, plus `extraRules` from outside) with its meta and what it reads. */
export const allRuleMeta = (extraRules: Rule[] = []): [Finding["ruleId"], RuleMeta<any>, "config" | "session-logs"][] => [
  ...[...rules, ...extraRules].map((r) => [r.id, r.meta, "config"] as [Finding["ruleId"], RuleMeta<any>, "config"]),
  ["INFO_UNUSED_DISABLE", unusedDisableMeta, "config"],
  ...Object.entries(finopsMeta).map(([id, meta]) => [id, meta, "session-logs"] as [Finding["ruleId"], RuleMeta<any>, "session-logs"]),
];

/** Runs every rule except the ones a config turns off. `options` holds raw per-rule options; each rule parses its own. */
export async function runRules(
  ctx: RuleContext,
  list: Rule[] = rules,
  options: Partial<Record<Finding["ruleId"], Record<string, unknown>>> = {},
  off: ReadonlySet<string> = new Set(),
): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const r of list) {
    if (off.has(r.id)) continue;
    const opts = r.meta.options ? r.meta.options.parse(options[r.id] ?? {}) : {};
    for (const f of await r.check(ctx, opts)) out.push(Finding.parse(f));
  }
  return out;
}
