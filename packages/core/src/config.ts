import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { z } from "zod";
import { finopsMeta, rules } from "./rules/index.js";
import { RuleId, Severity, type Finding, type ScannedFile } from "./schema.js";

export const CONFIG_FILE = "ctxmedic.config.json";

/** "off" drops the rule, "on" keeps the severity the rule picks, a severity forces it (ADR-020). */
export const RuleLevel = z.union([z.literal("off"), z.literal("on"), Severity]);
export type RuleLevel = z.infer<typeof RuleLevel>;

export const RuleEntry = z.union([RuleLevel, z.tuple([RuleLevel]), z.tuple([RuleLevel, z.record(z.string(), z.unknown())])]);
export type RuleEntry = z.infer<typeof RuleEntry>;

export const CtxmedicConfig = z.object({
  $schema: z.string().optional(),
  rules: z.partialRecord(RuleId, RuleEntry).default({}),
  /** Globs over finding paths (project-relative, or `~/` for global files). */
  ignores: z.array(z.string()).default([]),
});
export type CtxmedicConfig = z.infer<typeof CtxmedicConfig>;

export class ConfigError extends Error {}

export const levelOf = (e: RuleEntry | undefined): RuleLevel => (e === undefined ? "on" : typeof e === "string" ? e : e[0]);
export const optionsOf = (e: RuleEntry | undefined): Record<string, unknown> => (Array.isArray(e) && e[1]) || {};

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
export function describeRules(config: CtxmedicConfig): RuleInfo[] {
  const all = [
    ...rules.map((r) => [r.id, r.meta, "config"] as const),
    ...Object.entries(finopsMeta).map(([id, meta]) => [id as RuleId, meta, "session-logs"] as const),
  ];
  return all.map(([id, meta, source]) => {
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
  const metas = [...rules.map((r) => [r.id, r.meta] as const), ...Object.entries(finopsMeta)];
  const entry = (meta: (typeof metas)[number][1]) =>
    note(z.union([level, z.tuple([level]), z.tuple([level, (meta.options as z.ZodType | undefined) ?? z.object({}).strict()])]), {
      description: `${meta.description}. ${meta.docs}`,
    });
  const editorConfig = z.object({
    $schema: z.string().optional(),
    rules: note(z.strictObject(Object.fromEntries(metas.map(([id, meta]) => [id, entry(meta).optional()]))), {
      description: 'Rule levels and options: "off", "on", a severity, or [level, options].',
    }).optional(),
    ignores: note(z.array(z.string()), { description: "Globs over finding paths (project-relative, or ~/ for global files)." }).optional(),
  });
  // draft-7: the widest editor support (VS Code included).
  return z.toJSONSchema(editorConfig, { io: "input", target: "draft-7", unrepresentable: "any", metadata: reg }) as Record<string, unknown>;
}

/** Reads `ctxmedic.config.json` in the root; no file means an empty config. Invalid config throws, it never falls back silently. */
export function loadConfig(root: string): CtxmedicConfig {
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
  for (const [id, entry] of Object.entries(r.data.rules)) {
    const opts = optionsOf(entry);
    if (!Object.keys(opts).length) continue;
    const schema = (rules.find((x) => x.id === id)?.meta ?? finopsMeta[id as keyof typeof finopsMeta])?.options;
    if (!schema) throw new ConfigError(`${CONFIG_FILE}: rule ${id} takes no options`);
    const o = schema.safeParse(opts);
    if (!o.success) throw new ConfigError(`${CONFIG_FILE}: rule ${id}: ${z.prettifyError(o.error)}`);
  }
  return r.data;
}

/** Stable id of the settings that change the score, "" for no config (history compares only equal ones, ADR-017). */
export function configHash(c: CtxmedicConfig): string {
  if (!Object.keys(c.rules).length && !c.ignores.length) return "";
  const rulesSorted = Object.fromEntries(Object.entries(c.rules).sort(([a], [b]) => a.localeCompare(b)));
  return crypto.createHash("sha256").update(JSON.stringify([rulesSorted, c.ignores])).digest("hex").slice(0, 12);
}

const DIRECTIVE = /<!--\s*ctxmedic-disable\b([\s\S]*?)-->/g;

/** Rule ids a file disables with `<!-- ctxmedic-disable [IDS] [-- reason] -->`; "*" means every rule. */
export function disabledIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(DIRECTIVE)) {
    const ids = m[1]!.split("--")[0]!.split(/[\s,]+/).filter(Boolean);
    if (!ids.length) out.add("*");
    for (const id of ids) out.add(id);
  }
  return out;
}

/** Applies levels, `ignores` and inline disable comments. A finding is ignored only when every one of its files is. */
export function applyConfig(findings: Finding[], files: ScannedFile[], config: CtxmedicConfig): Finding[] {
  const ignored = config.ignores.length ? picomatch(config.ignores, { dot: true }) : () => false;
  const disabled = new Map(files.filter((f) => f.text?.includes("ctxmedic-disable")).map((f) => [f.rel, disabledIn(f.text!)]));
  return findings.flatMap((f) => {
    const level = levelOf(config.rules[f.ruleId]);
    if (level === "off") return [];
    if (f.files.length && f.files.every((p) => ignored(p))) return [];
    if (f.files.some((p) => disabled.get(p)?.has("*") || disabled.get(p)?.has(f.ruleId))) return [];
    return [level === "on" ? f : { ...f, severity: level }];
  });
}
