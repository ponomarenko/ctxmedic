import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  // Bundle internal workspace packages; keep npm deps external (declared in package.json).
  noExternal: [/^@ctxmedic\//],
  banner: { js: "#!/usr/bin/env node" },
  define: { __CTXMEDIC_VERSION__: JSON.stringify(version) },
});
