import { parseFrontmatter } from "../parse.js";
import type { Finding } from "../schema.js";
import { docsUrl, type Rule } from "./types.js";

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
// Any wording that tells the model WHEN to load the skill counts ("Use when", "Use with", "Trigger on", ...).
const TRIGGER = /\b(use|when|whenever|triggers?|invoke)\b/i;

export const skills: Rule = {
  id: "ERR_INVALID_SKILL",
  meta: {
    description: "Skills need valid frontmatter, a unique name and a description with a trigger",
    type: "problem",
    docs: docsUrl("ERR_INVALID_SKILL"),
    fixable: false,
  },
  check: ({ files }) => {
    const out: Finding[] = [];
    const names = new Map<string, string[]>();
    const bad = (f: { rel: string }, severity: Finding["severity"], problem: string) =>
      out.push({ ruleId: "ERR_INVALID_SKILL", severity, message: `${f.rel}: ${problem}`, files: [f.rel], data: { problem } });
    for (const f of files) {
      if (f.role !== "skill" || f.text === undefined) continue;
      const { data, error } = parseFrontmatter(f.text);
      if (!data) {
        bad(f, "warning", "no YAML frontmatter; the harness cannot discover this skill");
        continue;
      }
      if (error) {
        bad(f, "warning", `invalid YAML frontmatter (${error})`);
        continue;
      }
      const name = typeof data.name === "string" ? data.name : "";
      const desc = typeof data.description === "string" ? data.description : "";
      if (!name) bad(f, "warning", "missing `name`");
      else if (!NAME.test(name)) bad(f, "warning", `name "${name}" must be lowercase letters, digits and hyphens (max 64)`);
      if (!desc) bad(f, "warning", "missing `description`; the model never knows when to load it");
      else if (desc.length > 1024) bad(f, "warning", `description is ${desc.length} chars (max 1024)`);
      else if (desc.length < 40 || !TRIGGER.test(desc))
        bad(f, "info", "description has no clear trigger (\"Use when …\"); the skill will rarely activate");
      if (name) names.set(`${f.scope}:${name}`, [...(names.get(`${f.scope}:${name}`) ?? []), f.rel]);
    }
    for (const [key, rels] of names)
      if (rels.length > 1)
        out.push({
          ruleId: "ERR_INVALID_SKILL",
          severity: "warning",
          message: `skill name "${key.split(":")[1]}" is used by ${rels.length} skills`,
          files: rels,
          data: { problem: "duplicate name" },
        });
    return out;
  },
};
