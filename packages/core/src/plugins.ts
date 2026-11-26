import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { ConfigError } from "./config.js";
import type { Rule } from "./rules/index.js";
import { EXTERNAL_RULE_ID } from "./schema.js";

export interface LoadedPlugin {
  name: string;
  version?: string;
  rules: Rule[];
}

// Checked by shape, not `instanceof`: a plugin ships its own copy of zod.
const fn = z.custom<(...a: unknown[]) => unknown>((v) => typeof v === "function", "a function");
const PluginRule = z.object({
  id: z.string().regex(EXTERNAL_RULE_ID, "a namespaced id like plugin/RULE_NAME"),
  meta: z.object({
    description: z.string().min(1),
    type: z.enum(["problem", "suggestion"]),
    docs: z.string(),
    fixable: z.boolean(),
    options: z.custom((v) => v === undefined || typeof (v as { safeParse?: unknown })?.safeParse === "function", "a zod schema").optional(),
    card: z.object({ name: z.string(), prognosis: fn, action: fn }).optional(),
  }),
  check: fn,
});
const PluginModule = z.object({ namespace: z.string().regex(/^[a-z][a-z0-9-]*$/), rules: z.array(PluginRule) });

/** The file `import()` should load: `exports["."]` (import/default), then `module`, then `main`. */
function entryOf(dir: string, pkg: Record<string, any>): string {
  const pick = (e: unknown): string | undefined =>
    typeof e === "string" ? e : e && typeof e === "object" ? pick((e as any).import ?? (e as any).default ?? (e as any).node) : undefined;
  const ex = pkg.exports;
  const dot = typeof ex === "string" || (ex && !Object.keys(ex).some((k) => k.startsWith("."))) ? ex : ex?.["."];
  return path.resolve(dir, pick(dot) ?? pkg.module ?? pkg.main ?? "index.js");
}

/**
 * Loads plugins from `<root>/node_modules` only (no lookup in parent folders, nothing is installed) and checks
 * every rule against the contract. Plugin code runs with ctxmedic's own rights, so callers load plugins only
 * when the user asked for it on this run (ADR-027).
 */
export async function loadPlugins(root: string, names: string[]): Promise<LoadedPlugin[]> {
  const out: LoadedPlugin[] = [];
  for (const name of names) {
    const dir = path.join(path.resolve(root), "node_modules", name);
    const pkgFile = path.join(dir, "package.json");
    if (!fs.existsSync(pkgFile)) throw new ConfigError(`plugin ${name} is not installed in ${path.join(root, "node_modules")}`);
    const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
    const entry = entryOf(dir, pkg);
    if (path.relative(dir, entry).startsWith("..")) throw new ConfigError(`plugin ${name}: its entry point is outside the package`);
    const mod = await import(pathToFileURL(entry).href);
    const parsed = PluginModule.safeParse(mod.default ?? mod);
    if (!parsed.success) throw new ConfigError(`plugin ${name}: ${z.prettifyError(parsed.error)}`);
    const { namespace, rules } = parsed.data;
    const foreign = rules.find((r) => !r.id.startsWith(`${namespace}/`));
    if (foreign) throw new ConfigError(`plugin ${name}: rule ${foreign.id} is outside its namespace ${namespace}/`);
    out.push({ name, version: pkg.version, rules: (mod.default ?? mod).rules as Rule[] });
  }
  return out;
}
