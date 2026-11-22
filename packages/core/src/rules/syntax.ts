import { parseFrontmatter } from "../parse.js";
import type { Finding } from "../schema.js";
import { docsUrl, type Rule } from "./types.js";

function directives(text: string): string[] {
  const found = new Set<string>();
  if (/^@[~\w./-]+\.\w+\s*$/m.test(text)) found.add("@import");
  const { data } = parseFrontmatter(text);
  if (data) for (const k of ["alwaysApply", "globs", "applyTo", "trigger"]) if (k in data) found.add(k);
  return [...found];
}

export const syntax: Rule = {
  id: "INFO_UNSUPPORTED_SYNTAX",
  meta: {
    description: "Flag directives a harness does not understand",
    type: "suggestion",
    docs: docsUrl("INFO_UNSUPPORTED_SYNTAX"),
    fixable: false,
  },
  check: ({ files, profiles }) => {
    const out: Finding[] = [];
    for (const f of files) {
      if (!f.text || (f.role !== "instructions" && f.role !== "rules")) continue;
      const used = directives(f.text);
      if (!used.length) continue;
      for (const hid of f.harnesses) {
        const h = profiles.find((p) => p.id === hid);
        const missing = used.filter((d) => !h?.syntax.includes(d));
        if (missing.length)
          out.push({
            ruleId: "INFO_UNSUPPORTED_SYNTAX",
            severity: "info",
            message: `${f.rel} uses ${missing.join(", ")}, which ${h?.name ?? hid} ignores (it sees the raw text)`,
            files: [f.rel],
            data: { harness: hid, directives: missing },
          });
      }
    }
    return out;
  },
};
