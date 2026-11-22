// Copies the built UI and legal files into the publishable CLI package.
import { cpSync, existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ui = here("../../ui/dist");
rmSync(here("../public"), { recursive: true, force: true });
if (existsSync(ui)) cpSync(ui, here("../public"), { recursive: true });
else console.warn("[ctxmedic] packages/ui/dist missing: build the UI first");
for (const f of ["LICENSE", "NOTICE", "README.md"]) cpSync(here(`../../../${f}`), here(`../${f}`));
