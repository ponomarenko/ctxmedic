import { z } from "zod";
import { BLOAT_TOKENS, docsUrl, type Rule } from "./types.js";

const Options = z.object({ tokens: z.number().int().positive().default(BLOAT_TOKENS) });

export const contextBloat: Rule<z.infer<typeof Options>> = {
  id: "WARN_CONTEXT_BLOAT",
  meta: {
    description: "Limit the tokens a harness loads at session start",
    type: "suggestion",
    docs: docsUrl("WARN_CONTEXT_BLOAT"),
    fixable: false,
    options: Options,
  },
  check: ({ startup, profiles }, { tokens: threshold }) =>
    Object.entries(startup)
      .filter(([, l]) => l.tokens > threshold)
      .map(([id, l]) => {
        const top = [...l.files].sort((a, b) => b.tokens - a.tokens).slice(0, 5);
        const limit = profiles.find((p) => p.id === id)?.contextLimit ?? 200_000;
        return {
          ruleId: "WARN_CONTEXT_BLOAT" as const,
          severity: l.tokens > threshold * 3 ? ("critical" as const) : ("warning" as const),
          message: `${id} loads ${l.tokens.toLocaleString("en")} tokens at session start (threshold ${threshold.toLocaleString("en")})`,
          files: top.map((f) => f.rel),
          data: { harness: id, tokens: l.tokens, threshold, contextShare: l.tokens / limit, top },
        };
      }),
};
