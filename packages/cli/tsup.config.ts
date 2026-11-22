import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  // Bundle internal workspace packages; keep npm deps external (declared in package.json).
  noExternal: [/^@ctxmedic\//],
  banner: { js: "#!/usr/bin/env node" },
});
