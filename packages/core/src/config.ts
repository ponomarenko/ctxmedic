import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { z } from "zod";
import { PRESET_NAMES, PRESETS } from "./presets.js";
import { allRuleMeta, type Rule } from "./rules/index.js";
import { EXTERNAL_RULE_ID, RuleId, Severity, type Finding, type ScannedFile } from "./schema.js";

export const CONFIG_FILE = "ctxmedic.config.json";

/** "off" drops the rule, "on" keeps the severity the rule picks, a severity forces it (ADR-020). */
export const RuleLevel = z.union([z.literal("off"), z.literal("on"), Severity]);
export type RuleLevel = z.infer<typeof RuleLevel>;

export const RuleEntry = z.union([RuleLevel, z.tuple([RuleLevel]), z.tuple([RuleLevel, z.record(z.string(), z.unknown())])]);
export type RuleEntry = z.infer<typeof RuleEntry>;

export const Preset = z.enum(PRESET_NAMES);

export const CtxmedicConfig = z.object({
  $schema: z.string().optional(),
  /** Built-in presets applied in order before this file's own `rules` and `ignores`. */
  extends: z.union([Preset, z.array(Preset)]).optional(),
  rules: z.partialRecord(RuleId, RuleEntry).default({}),
  /** Globs over finding paths (project-relative, or `~/` for global files). */
  ignores: z.array(z.string()).default([]),
  /** npm packages in the project's node_modules that add rules; loaded only with `--plugins` (ADR-027). */
  plugins: z.array(z.string().regex(/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, "an npm package name")).default([]),
});
export type CtxmedicConfig = z.infer<typeof CtxmedicConfig>;

export class ConfigError extends Error {}

export const levelOf = (e: RuleEntry | undefined): RuleLevel => (e === undefined ? "on" : typeof e === "string" ? e : e[0]);
export const optionsOf = (e: RuleEntry | undefined): Record<string, unknown> => (Array.isArray(e) && e[1]) || {};

/**
 * Applies `extends`: presets in order, then the file's own settings. A later entry replaces an earlier one,
 * except that a level alone keeps the earlier options (ESLint does the same). `ignores` add up.
 */
export function resolveConfig(c: CtxmedicConfig): CtxmedicConfig {
  const names = c.extends === undefined ? [] : typeof c.extends === "string" ? [c.extends] : c.extends;
  const rules: Partial<Record<RuleId, RuleEntry>> = {};
  const ignores: string[] = [];
  for (const layer of [...names.map((n) => PRESETS[n]), { rules: c.rules, ignores: c.ignores }]) {
    for (const [id, entry] of Object.entries(layer.rules) as [RuleId, RuleEntry][]) {
      const before = optionsOf(rules[id]);
      rules[id] = !Object.keys(optionsOf(entry)).length && Object.keys(before).length ? [levelOf(entry), before] : entry;
    }
    ignores.push(...(layer.ignores ?? []));
  }
  return { ...c, rules, ignores };
}

/** One rule as `ctxmedic rules` shows it: its meta plus what the config made of it. */
export const RuleInfo = z.object({
  id: RuleId,
  /** "config": reads config files; "session-logs": a FIN_* detector that reads session logs. */
  source: z.enum(["config", "session-logs"]),
  level: RuleLevel,
  type: z.enum(["problem", "suggestion"]),
  fixable: z.boolean(),
  description: z.string(),
  docs: z.string(),
  /** Effective options, defaults included. */
  options: z.record(z.string(), z.unknown()),
  /** Options the config set to a value other than the default. */
  changed: z.record(z.string(), z.unknown()),
});
export type RuleInfo = z.infer<typeof RuleInfo>;

/** Every rule and FIN_* detector with its effective level and options under `config`. */
export function describeRules(config: CtxmedicConfig, extraRules: Rule[] = []): RuleInfo[] {
  return allRuleMeta(extraRules).map(([id, meta, source]) => {
    const entry = config.rules[id];
    const options = (meta.options?.parse(optionsOf(entry)) ?? {}) as Record<string, unknown>;
    const defaults = (meta.options?.parse({}) ?? {}) as Record<string, unknown>;
    const changed = Object.fromEntries(Object.entries(options).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(defaults[k])));
    return RuleInfo.parse({ id, source, level: levelOf(entry), type: meta.type, fixable: meta.fixable, description: meta.description, docs: meta.docs, options, changed });
  });
}

/**
 * JSON Schema of `ctxmedic.config.json` for editors (`$schema`): like `CtxmedicConfig`, but each rule id gets its
 * own options and description, and unknown ids are flagged. `packages/cli/schema.json` is this output; a test keeps it fresh.
 */
export function configJsonSchema(): Record<string, unknown> {
  // A private registry, so ids and descriptions do not depend on zod's global one.
  const reg = z.registry<{ id?: string; description?: string }>();
  const note = <T extends z.ZodType>(schema: T, meta: { id?: string; description?: string }) => (reg.add(schema, meta), schema);
  const level = note(RuleLevel.clone(), { id: "RuleLevel", description: '"off", "on" (the rule picks the severity) or a severity to force' });
  const metas = allRuleMeta();
  const entry = (meta: (typeof metas)[number][1]) =>
    note(z.union([level, z.tuple([level]), z.tuple([level, (meta.options as z.ZodType | undefined) ?? z.object({}).strict()])]), {
      description: `${meta.description}. ${meta.docs}`,
    });
  const editorConfig = z.object({
    $schema: z.string().optional(),
    plugins: note(z.array(z.string()), { description: "npm packages in node_modules that add rules. They run only with --plugins (their code can do anything ctxmedic can)." }).optional(),
    extends: note(z.union([Preset, z.array(Preset)]), { description: "Built-in presets applied before this file's rules: ctxmedic:recommended, ctxmedic:strict." }).optional(),
    rules: note(z.strictObject(Object.fromEntries(metas.map(([id, meta]) => [id, entry(meta).optional()]))), {
      description: 'Rule levels and options: "off", "on", a severity, or [level, options].',
    }).optional(),
    ignores: note(z.array(z.string()), { description: "Globs over finding paths (project-relative, or ~/ for global files)." }).optional(),
  });
  // draft-7: the widest editor support (VS Code included).
  const json = z.toJSONSchema(editorConfig, { io: "input", target: "draft-7", unrepresentable: "any", metadata: reg }) as any;
  // Namespaced ids (plugin rules, ADR-026) are allowed with any options; built-in ids keep their own entries.
  const levelRef = { $ref: "#/definitions/RuleLevel" };
  json.properties.rules.patternProperties = {
    [EXTERNAL_RULE_ID.source]: {
      description: "A rule from a plugin: plugin/RULE_NAME.",
      anyOf: [levelRef, { type: "array", items: [levelRef], minItems: 1, maxItems: 1 }, { type: "array", items: [levelRef, { type: "object" }], minItems: 2, maxItems: 2 }],
    },
  };
  return json as Record<string, unknown>;
}

/** Reads `ctxmedic.config.json` in the root; no file means an empty config. Invalid config throws, it never falls back silently. */
export function loadConfig(root: string, extraRules: Rule[] = []): CtxmedicConfig {
  const file = path.join(root, CONFIG_FILE);
  if (!fs.existsSync(file)) return CtxmedicConfig.parse({});
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new ConfigError(`${CONFIG_FILE}: ${(e as Error).message}`);
  }
  const r = CtxmedicConfig.safeParse(raw);
  if (!r.success) throw new ConfigError(`${CONFIG_FILE}: ${z.prettifyError(r.error)}`);
  const config = resolveConfig(r.data);
  for (const [id, entry] of Object.entries(config.rules)) {
    const opts = optionsOf(entry);
    if (!Object.keys(opts).length) continue;
    const known = allRuleMeta(extraRules).find(([x]) => x === id);
    // A namespaced rule from a plugin that is not loaded this run: keep its settings unchecked; it does not run.
    if (!known && id.includes("/")) continue;
    const schema = known?.[1].options;
    if (!schema) throw new ConfigError(`${CONFIG_FILE}: rule ${id} takes no options`);
    const o = schema.safeParse(opts);
    if (!o.success) throw new ConfigError(`${CONFIG_FILE}: rule ${id}: ${z.prettifyError(o.error)}`);
  }
  return config;
}

/** Stable id of the settings that change the score, "" for no config (history compares only equal ones, ADR-017). */
export function configHash(c: CtxmedicConfig): string {
  if (!Object.keys(c.rules).length && !c.ignores.length) return "";
  const rulesSorted = Object.fromEntries(Object.entries(c.rules).sort(([a], [b]) => a.localeCompare(b)));
  return crypto.createHash("sha256").update(JSON.stringify([rulesSorted, c.ignores])).digest("hex").slice(0, 12);
}

// `ctxmedic-disable`, `ctxmedic-disable-line` or `ctxmedic-disable-next-line`; the lookahead keeps the plain
// form from matching the line forms.
const DIRECTIVE = /<!--\s*ctxmedic-disable(-next-line|-line)?(?!\w|-(?!->))([\s\S]*?)-->/g;

export interface Directive {
  kind: "file" | "line" | "next-line";
  /** Rule ids; empty means every rule. */
  ids: Set<string>;
  /** 1-based line of the comment. */
  line: number;
  /** The line a line-level directive covers. */
  target?: number;
}

const lineAt = (text: string, i: number) => text.slice(0, i).split("\n").length;

/** Every disable comment in a file, with the lines it covers. */
export function directivesIn(text: string): Directive[] {
  return [...text.matchAll(DIRECTIVE)].map((m) => {
    const kind = m[1] === "-next-line" ? "next-line" : m[1] === "-line" ? "line" : "file";
    const line = lineAt(text, m.index!);
    const ids = new Set(m[2]!.split("--")[0]!.split(/[\s,]+/).filter(Boolean));
    const target = kind === "line" ? line : kind === "next-line" ? lineAt(text, m.index! + m[0].length) + 1 : undefined;
    return { kind, ids, line, target };
  });
}

/** Rule ids a file disables with `<!-- ctxmedic-disable [IDS] [-- reason] -->`; "*" means every rule. */
export function disabledIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const d of directivesIn(text).filter((d) => d.kind === "file")) {
    if (!d.ids.size) out.add("*");
    for (const id of d.ids) out.add(id);
  }
  return out;
}

/**
 * Applies levels, `ignores` and disable comments. A finding is ignored only when every one of its files is.
 * A file-level comment silences findings that report its file; a line-level one only findings with that `line`
 * in their first file. With `reportUnused`, comments that silenced nothing become INFO_UNUSED_DISABLE findings.
 */
export function applyConfig(findings: Finding[], files: ScannedFile[], config: CtxmedicConfig, opts: { reportUnused?: boolean } = {}): Finding[] {
  const ignored = config.ignores.length ? picomatch(config.ignores, { dot: true }) : () => false;
  const comments = new Map(files.filter((f) => f.text?.includes("ctxmedic-disable")).map((f) => [f.rel, directivesIn(f.text!)]));
  const used = new Set<Directive>();
  const level = (f: Finding): Finding | null => {
    const l = levelOf(config.rules[f.ruleId]);
    if (l === "off" || (f.files.length && f.files.every((p) => ignored(p)))) return null;
    return l === "on" ? f : { ...f, severity: l };
  };
  const out = findings.flatMap((f) => {
    const kept = level(f);
    if (!kept) return [];
    const hits = f.files.flatMap((p, i) =>
      (comments.get(p) ?? []).filter(
        (d) => (!d.ids.size || d.ids.has(f.ruleId)) && (d.kind === "file" || (i === 0 && f.line !== undefined && d.target === f.line)),
      ),
    );
    for (const d of hits) used.add(d);
    return hits.length ? [] : [kept];
  });
  if (!opts.reportUnused) return out;
  const unused = [...comments].flatMap(([rel, ds]) =>
    ds
      .filter((d) => !used.has(d))
      .map((d) => ({
        ruleId: "INFO_UNUSED_DISABLE" as const,
        severity: "info" as const,
        message: `${rel}:${d.line}: ctxmedic-disable${d.kind === "file" ? "" : `-${d.kind}`} silences nothing`,
        files: [rel],
        line: d.line,
        data: { ids: [...d.ids], kind: d.kind },
      })),
  );
  return [...out, ...unused.flatMap((f) => level(f) ?? [])];
}
