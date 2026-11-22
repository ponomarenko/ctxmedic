import { Finding } from "../schema.js";
import { bloatIgnore } from "./bloatIgnore.js";
import { brokenLink } from "./brokenLink.js";
import { contextBloat } from "./contextBloat.js";
import { duplicates } from "./duplicates.js";
import { secretLeak } from "./secretLeak.js";
import { skills } from "./skills.js";
import { syntax } from "./syntax.js";
import type { Rule, RuleContext } from "./types.js";

export * from "./types.js";
export { similarity } from "./duplicates.js";

export const rules: Rule[] = [brokenLink, contextBloat, duplicates, skills, secretLeak, syntax, bloatIgnore];

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
