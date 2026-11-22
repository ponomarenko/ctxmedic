import path from "node:path";
import type { Finding } from "../schema.js";
import type { Rule } from "./types.js";

export const brokenLink: Rule = {
  id: "ERR_BROKEN_LINK",
  check: ({ files }) =>
    files.flatMap((f): Finding[] => {
      if (f.broken || f.loop)
        return [
          {
            ruleId: "ERR_BROKEN_LINK" as const,
            severity: "critical" as const,
            message: f.loop
              ? `${f.rel} is a circular symlink`
              : `${f.rel} points to a missing target: ${f.linkTarget}`,
            files: [f.rel],
            data: { target: f.linkTarget, loop: f.loop, harnesses: f.harnesses },
          },
        ];
      if (f.isSymlink && f.linkTarget && path.isAbsolute(f.linkTarget) && f.scope === "project")
        return [
          {
            ruleId: "ERR_BROKEN_LINK" as const,
            severity: "info" as const,
            message: `${f.rel} uses an absolute symlink; it breaks on other machines and in CI`,
            files: [f.rel],
            data: { target: f.linkTarget, absolute: true },
            fix: {
              title: `Make ${f.rel} a relative symlink`,
              ops: [{ kind: "symlink" as const, path: f.path, target: path.relative(path.dirname(f.path), f.linkTarget) }],
            },
          },
        ];
      return [];
    }),
};
