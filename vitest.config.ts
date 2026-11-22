import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const p = (s: string) => fileURLToPath(new URL(s, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      "@ctxmedic/core": p("./packages/core/src/index.ts"),
      "@ctxmedic/harnesses": p("./packages/harnesses/src/index.ts"),
      "@ctxmedic/finops": p("./packages/finops/src/index.ts"),
      "@ctxmedic/clinical": p("./packages/clinical/src/index.ts"),
      "@ctxmedic/server": p("./packages/server/src/index.ts"),
    },
  },
  test: { include: ["packages/*/test/**/*.test.ts"] },
});
