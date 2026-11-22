import { isGitIgnored } from "../git.js";
import { findSecrets } from "../secrets.js";
import type { Rule } from "./types.js";

export const secretLeak: Rule = {
  id: "CRIT_SECRET_LEAK",
  check: ({ files }) =>
    files.flatMap((f) => {
      if (!f.text) return [];
      const hits = findSecrets(f.text);
      if (!hits.length) return [];
      const ignored = isGitIgnored(f.path);
      // Exposed = inside a git repo and not ignored, so one `git add` away from a public leak.
      const exposed = f.scope === "project" && ignored === false;
      return [
        {
          ruleId: "CRIT_SECRET_LEAK" as const,
          severity: exposed ? ("critical" as const) : ("info" as const),
          message: exposed
            ? `${f.rel} contains ${hits.length} secret(s) and is not git-ignored`
            : `${f.rel} stores ${hits.length} secret(s) in plain text`,
          files: [f.rel],
          data: { hits, exposed, ignored },
        },
      ];
    }),
};
