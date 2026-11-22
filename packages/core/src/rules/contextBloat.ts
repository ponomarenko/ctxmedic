import { BLOAT_TOKENS, type Rule } from "./types.js";

export const contextBloat: Rule = {
  id: "WARN_CONTEXT_BLOAT",
  check: ({ startup, profiles }) =>
    Object.entries(startup)
      .filter(([, l]) => l.tokens > BLOAT_TOKENS)
      .map(([id, l]) => {
        const top = [...l.files].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
        const limit = profiles.find((p) => p.id === id)?.contextLimit ?? 200_000;
        return {
          ruleId: "WARN_CONTEXT_BLOAT" as const,
          severity: l.tokens > BLOAT_TOKENS * 3 ? ("critical" as const) : ("warning" as const),
          message: `${id} loads ${l.tokens.toLocaleString("en")} tokens at session start (threshold ${BLOAT_TOKENS.toLocaleString("en")})`,
          files: top.map((f) => f.rel),
          data: { harness: id, tokens: l.tokens, threshold: BLOAT_TOKENS, contextShare: l.tokens / limit, top },
        };
      }),
};
