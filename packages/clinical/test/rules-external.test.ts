import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { checkup, ClinicalReport } from "@ctxmedic/clinical";
import { ConfigError, describeRules, loadConfig, loadPlugins, type Rule } from "@ctxmedic/core";

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

  it("keep the settings of a rule that is not loaded (its plugin may be off), and reject bad ids", () => {
    write({ "ctxmedic.config.json": JSON.stringify({ rules: { "other/RULE": "warning" } }) });
    expect(loadConfig(root).rules["other/RULE"]).toBe("warning");
    write({ "ctxmedic.config.json": JSON.stringify({ rules: { "other/RULE": ["on", { x: 1 }] } }) });
    expect(loadConfig(root).rules["other/RULE"]).toEqual(["on", { x: 1 }]);
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

/** Installs a plugin package into `root/node_modules`, as `npm install` would. */
function plugin(name: string, source: string, pkg: Record<string, unknown> = {}) {
  const dir = path.join(root, "node_modules", name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name, version: "1.2.3", type: "module", exports: "./index.js", ...pkg }));
  fs.writeFileSync(path.join(dir, "index.js"), source);
}
const DEMO = `export default {
  namespace: "demo",
  rules: [{
    id: "demo/NO_TODO",
    meta: { description: "Keep TODO lines out of instruction files", type: "suggestion", docs: "https://example.com/NO_TODO", fixable: false },
    check: ({ files }) => files.filter((f) => f.text && f.text.includes("TODO")).map((f) => ({ ruleId: "demo/NO_TODO", severity: "warning", message: f.rel + " has a TODO", files: [f.rel], data: {} })),
  }],
};`;

describe("plugins", () => {
  const withPlugin = (extra: Record<string, string> = {}) => {
    write({ "CLAUDE.md": "TODO\n", "ctxmedic.config.json": JSON.stringify({ plugins: ["ctxmedic-plugin-demo"] }), ...extra });
    plugin("ctxmedic-plugin-demo", DEMO);
  };
  const go = (plugins: boolean) => checkup({ root, lang: "en", finops: false, global: false, record: false, plugins });

  it("add their rules when the run allows plugins, and are listed in the report", async () => {
    withPlugin();
    const r = ClinicalReport.parse(await go(true));
    expect(r.diagnoses.some((d) => d.code === "demo/NO_TODO")).toBe(true);
    expect(r.plugins).toEqual([{ name: "ctxmedic-plugin-demo", version: "1.2.3", loaded: true, rules: ["demo/NO_TODO"] }]);
  });

  it("are not loaded without the opt-in, and the report says so", async () => {
    withPlugin();
    const r = await go(false);
    expect(r.diagnoses.some((d) => d.code === "demo/NO_TODO")).toBe(false);
    expect(r.plugins).toEqual([{ name: "ctxmedic-plugin-demo", loaded: false, rules: [] }]);
  });

  it("are found only in the project's own node_modules", async () => {
    write({ "ctxmedic.config.json": JSON.stringify({ plugins: ["ctxmedic-plugin-missing"] }) });
    await expect(loadPlugins(root, ["ctxmedic-plugin-missing"])).rejects.toThrow(/not installed/);
  });

  it("reject rules outside their namespace and entry points outside the package", async () => {
    write({});
    plugin("ctxmedic-plugin-bad", DEMO.replace('namespace: "demo"', 'namespace: "other"'));
    await expect(loadPlugins(root, ["ctxmedic-plugin-bad"])).rejects.toThrow(/outside its namespace/);
    plugin("ctxmedic-plugin-escape", DEMO, { exports: "../../x.js" });
    await expect(loadPlugins(root, ["ctxmedic-plugin-escape"])).rejects.toThrow(/outside the package/);
    plugin("ctxmedic-plugin-shape", "export default { namespace: 'shape', rules: [{ id: 'shape/X' }] };");
    await expect(loadPlugins(root, ["ctxmedic-plugin-shape"])).rejects.toThrow(ConfigError);
  });

  it("check the options of their rules once loaded", async () => {
    withPlugin({ "ctxmedic.config.json": JSON.stringify({ plugins: ["ctxmedic-plugin-demo"], rules: { "demo/NO_TODO": ["on", { x: 1 }] } }) });
    plugin("ctxmedic-plugin-demo", DEMO);
    await expect(go(true)).rejects.toThrow(/takes no options/);
    expect((await go(false)).plugins[0]!.loaded).toBe(false);
  });
});

