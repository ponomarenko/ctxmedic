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

export async function runRules(ctx: RuleContext, list: Rule[] = rules): Promise<Finding[]> {
  const out: Finding[] = [];
  for (const r of list) for (const f of await r.check(ctx)) out.push(Finding.parse(f));
  return out;
}
