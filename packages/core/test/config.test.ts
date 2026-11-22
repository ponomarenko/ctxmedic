import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { ConfigError, configHash, CtxmedicConfig, disabledIn, examine, loadConfig, rules } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";

function project(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-cfg-"));
  for (const [p, c] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), c);
  }
  return root;
}
const cfg = (c: unknown) => ({ "ctxmedic.config.json": JSON.stringify(c) });
const ids = async (root: string) => (await examine(root, harnesses, { global: false })).findings.map((f) => f.ruleId);
const BIG = `# Project\n${"Lorem ipsum dolor sit amet. ".repeat(900)}\n`; // ~5k tokens
const BAD_SKILL = { ".claude/skills/bad/SKILL.md": "no frontmatter here" };

beforeAll(() => {
  process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
});

describe("ctxmedic.config.json", () => {
  it("turns a rule off", async () => {
    expect(await ids(project(BAD_SKILL))).toContain("ERR_INVALID_SKILL");
    expect(await ids(project({ ...BAD_SKILL, ...cfg({ rules: { ERR_INVALID_SKILL: "off" } }) }))).not.toContain("ERR_INVALID_SKILL");
  });

  it("forces a severity, or keeps the rule's own with \"on\"", async () => {
    const forced = await examine(project({ ...BAD_SKILL, ...cfg({ rules: { ERR_INVALID_SKILL: "critical" } }) }), harnesses, { global: false });
    expect(forced.findings.find((f) => f.ruleId === "ERR_INVALID_SKILL")!.severity).toBe("critical");
    const on = await examine(project({ ...BAD_SKILL, ...cfg({ rules: { ERR_INVALID_SKILL: "on" } }) }), harnesses, { global: false });
    expect(on.findings.find((f) => f.ruleId === "ERR_INVALID_SKILL")!.severity).toBe("warning");
  });

  it("passes rule options", async () => {
    expect(await ids(project({ "CLAUDE.md": BIG }))).toContain("WARN_CONTEXT_BLOAT");
    const root = project({ "CLAUDE.md": BIG, ...cfg({ rules: { WARN_CONTEXT_BLOAT: ["on", { tokens: 50_000 }] } }) });
    expect(await ids(root)).not.toContain("WARN_CONTEXT_BLOAT");
  });

  it("ignores findings whose files all match `ignores`", async () => {
    expect(await ids(project({ ...BAD_SKILL, ...cfg({ ignores: [".claude/skills/**"] }) }))).not.toContain("ERR_INVALID_SKILL");
  });

  it("rejects unknown rules, bad levels and bad options with a clear error", () => {
    expect(() => loadConfig(project(cfg({ rules: { NOPE: "off" } })))).toThrow(ConfigError);
    expect(() => loadConfig(project(cfg({ rules: { ERR_INVALID_SKILL: "error" } })))).toThrow(ConfigError);
    expect(() => loadConfig(project(cfg({ rules: { WARN_CONTEXT_BLOAT: ["on", { tokens: -1 }] } })))).toThrow(/WARN_CONTEXT_BLOAT/);
    expect(() => loadConfig(project(cfg({ rules: { ERR_INVALID_SKILL: ["on", { x: 1 }] } })))).toThrow(/takes no options/);
    expect(() => loadConfig(project({ "ctxmedic.config.json": "{ nope" }))).toThrow(ConfigError);
  });

  it("hashes only settings that change the score", () => {
    expect(configHash(CtxmedicConfig.parse({}))).toBe("");
    const a = configHash(CtxmedicConfig.parse({ rules: { ERR_INVALID_SKILL: "off", WARN_CONTEXT_BLOAT: "on" } }));
    const b = configHash(CtxmedicConfig.parse({ rules: { WARN_CONTEXT_BLOAT: "on", ERR_INVALID_SKILL: "off" } }));
    expect(a).toBe(b);
    expect(a).not.toBe("");
  });
});

describe("inline disable comments", () => {
  it("parses ids, wildcard and reason", () => {
    expect([...disabledIn("<!-- ctxmedic-disable ERR_INVALID_SKILL, CRIT_SECRET_LEAK -- test key -->")]).toEqual(["ERR_INVALID_SKILL", "CRIT_SECRET_LEAK"]);
    expect([...disabledIn("<!--ctxmedic-disable-->")]).toEqual(["*"]);
    expect(disabledIn("plain text").size).toBe(0);
  });

  it("silences a rule in the file that carries the comment", async () => {
    const skill = (c: string) => ({ ".claude/skills/bad/SKILL.md": `no frontmatter here\n${c}` });
    expect(await ids(project(skill("<!-- ctxmedic-disable ERR_INVALID_SKILL -->")))).not.toContain("ERR_INVALID_SKILL");
    expect(await ids(project(skill("<!-- ctxmedic-disable -->")))).not.toContain("ERR_INVALID_SKILL");
    expect(await ids(project(skill("<!-- ctxmedic-disable WARN_CONTEXT_BLOAT -->")))).toContain("ERR_INVALID_SKILL");
  });
});

describe("rule meta", () => {
  it("every rule has a description and a docs page", () => {
    for (const r of rules) {
      expect(r.meta.description.length).toBeGreaterThan(10);
      expect(fs.existsSync(path.join(__dirname, "../../../docs/rules", `${r.id}.md`))).toBe(true);
    }
  });
});
