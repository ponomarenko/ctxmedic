import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { checkup, ClinicalReport } from "@ctxmedic/clinical";
import { ConfigError, describeRules, loadConfig, type Rule } from "@ctxmedic/core";

// An in-memory rule from outside ctxmedic: what a plugin will provide (ADR-026).
const noTodo: Rule = {
  id: "demo/NO_TODO",
  meta: { description: "Keep TODO lines out of instruction files", type: "suggestion", docs: "https://example.com/NO_TODO", fixable: false },
  check: ({ files }) =>
    files
      .filter((f) => f.role === "instructions" && f.text?.includes("TODO"))
      .map((f) => ({ ruleId: "demo/NO_TODO" as const, severity: "warning" as const, message: `${f.rel} has a TODO`, files: [f.rel], data: {} })),
};

let root: string;
const write = (files: Record<string, string>) => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-ext-"));
  for (const [p, c] of Object.entries(files)) fs.writeFileSync(path.join(root, p), c);
};
const run = (extraRules: Rule[] = [noTodo]) => checkup({ root, lang: "en", finops: false, global: false, record: false, extraRules });

beforeEach(() => {
  process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
});

describe("rules with namespaced ids", () => {
  it("run, get a card built from their meta, and count in the Health Score", async () => {
    write({ "CLAUDE.md": "# Project\nTODO: write the rules.\n" });
    const r = ClinicalReport.parse(await run());
    const d = r.diagnoses.find((x) => x.code === "demo/NO_TODO")!;
    expect(d.diagnosis).toBe("demo/NO_TODO");
    expect(d.prognosis).toContain("Keep TODO lines out of instruction files");
    expect(d.rx.action).toContain("https://example.com/NO_TODO");
    expect(r.healthScore).toBe(100 - 8);
    // Without the rule, nothing of it shows.
    expect((await run([])).diagnoses.some((x) => x.code === "demo/NO_TODO")).toBe(false);
  });

  it("use the rule's own card when it has one", async () => {
    write({ "CLAUDE.md": "TODO\n" });
    const withCard: Rule = { ...noTodo, meta: { ...noTodo.meta, card: { name: "Unfinished Chart", prognosis: () => "p", action: () => "a" } } };
    expect((await run([withCard])).diagnoses.find((x) => x.code === "demo/NO_TODO")!.diagnosis).toBe("Unfinished Chart");
  });

  it("are configurable like built-in rules", async () => {
    write({ "CLAUDE.md": "TODO\n", "ctxmedic.config.json": JSON.stringify({ rules: { "demo/NO_TODO": "off" } }) });
    expect((await run()).diagnoses.some((x) => x.code === "demo/NO_TODO")).toBe(false);
    expect(describeRules(loadConfig(root, [noTodo]), [noTodo]).find((x) => x.id === "demo/NO_TODO")!.level).toBe("off");
  });

  it("keep the level of a rule that is not loaded, but reject options nobody can check", () => {
    write({ "ctxmedic.config.json": JSON.stringify({ rules: { "other/RULE": "warning" } }) });
    expect(loadConfig(root).rules["other/RULE"]).toBe("warning");
    write({ "ctxmedic.config.json": JSON.stringify({ rules: { "other/RULE": ["on", { x: 1 }] } }) });
    expect(() => loadConfig(root)).toThrow(/not loaded/);
    write({ "ctxmedic.config.json": JSON.stringify({ rules: { "Bad/id": "off" } }) });
    expect(() => loadConfig(root)).toThrow(ConfigError);
  });
});

describe("built-in rules", () => {
  it("keep the same diagnoses as before namespaced ids", async () => {
    write({
      "CLAUDE.md": `# Project\n${"Lorem ipsum dolor sit amet. ".repeat(900)}\n`,
      "AGENTS.md": "# Project\nUse pnpm for everything.\nRun the tests before you push.\n@docs/extra.md\n",
      ".cursorrules": "# Project\nUse pnpm for everything.\nRun the tests before you push.\n",
    });
    const r = await run([]);
    expect(r.diagnoses.map((d) => [d.code, d.diagnosis, d.prognosis, d.rx.action, d.rx.healthGain])).toMatchSnapshot();
  });
});
