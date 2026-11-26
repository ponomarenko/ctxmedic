import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ClinicalReport } from "@ctxmedic/clinical";
import { RuleInfo } from "@ctxmedic/core";

const pkg = fileURLToPath(new URL("..", import.meta.url));
const bin = path.join(pkg, "dist/index.js");
let home: string;

const project = (files: Record<string, string>) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-cli-"));
  for (const [rel, text] of Object.entries(files)) fs.writeFileSync(path.join(root, rel), text);
  return root;
};
const run = (args: string[], cwd: string) =>
  spawnSync(process.execPath, [bin, ...args, "--no-global", "--no-finops"], { cwd, encoding: "utf8", env: { ...process.env, CTXMEDIC_HOME: home, NO_COLOR: "1" } });
const snapshot = (root: string) => fs.readdirSync(root, { recursive: true, encoding: "utf8" }).sort();

beforeAll(() => {
  // Rebuild so the test runs the current source, not a stale dist/.
  execFileSync("pnpm", ["exec", "tsup"], { cwd: pkg, stdio: "ignore" });
  home = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
}, 60_000);

describe("cli", () => {
  it("checkup --json prints a valid ClinicalReport and exits 0 when healthy", () => {
    const r = run(["checkup", ".", "--json"], project({ "CLAUDE.md": "# Project\nUse pnpm." }));
    expect(r.status).toBe(0);
    expect(ClinicalReport.parse(JSON.parse(r.stdout)).counts.resuscitation).toBe(0);
  });

  it("exits 1 on critical findings", () => {
    const key = "sk-ant-api03-" + "a1B2c3D4".repeat(5);
    const root = project({ ".mcp.json": JSON.stringify({ mcpServers: { x: { env: { ANTHROPIC_API_KEY: key } } } }) });
    // A secret is critical only when exposed: inside a git repo and not ignored.
    execFileSync("git", ["init", "-q"], { cwd: root });
    const r = run(["checkup", ".", "--json"], root);
    expect(r.status).toBe(1);
    expect(ClinicalReport.parse(JSON.parse(r.stdout)).counts.resuscitation).toBeGreaterThan(0);
    expect(r.stdout).not.toContain(key);
  });

  it("treat --all --dry-run -y leaves files unchanged", () => {
    const root = project({ ".cursorrules": "Use TypeScript strict mode everywhere." });
    fs.mkdirSync(path.join(root, "dist"));
    const before = snapshot(root);
    const r = run(["treat", "--all", "--dry-run", "-y"], root);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("dry-run");
    expect(snapshot(root)).toEqual(before);
  });

  it("restore lists backups and undoes treat", () => {
    const root = project({ ".cursorrules": "Use TypeScript strict mode everywhere." });
    fs.mkdirSync(path.join(root, "dist"));
    expect(spawnSync(process.execPath, [bin, "restore"], { cwd: root, encoding: "utf8" }).stdout).toContain("nothing to restore");
    expect(run(["treat", "--all", "-y"], root).status).toBe(0);
    expect(fs.existsSync(path.join(root, ".cursorignore"))).toBe(true);
    expect(spawnSync(process.execPath, [bin, "restore"], { cwd: root, encoding: "utf8" }).stdout).toMatch(/\d{4}-\d{2}-\d{2}T.*\n/);
    const r = spawnSync(process.execPath, [bin, "restore", "latest"], { cwd: root, encoding: "utf8" });
    expect(r.status).toBe(0);
    expect(fs.existsSync(path.join(root, ".cursorignore"))).toBe(false);
  });

  it("rules lists every rule with the level and options from the config", () => {
    const config = { rules: { INFO_UNSUPPORTED_SYNTAX: "off", WARN_CONTEXT_BLOAT: ["on", { tokens: 6000 }] } };
    const root = project({ "ctxmedic.config.json": JSON.stringify(config) });
    const rules = (...args: string[]) => spawnSync(process.execPath, [bin, "rules", ".", ...args], { cwd: root, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });

    const json = rules("--json");
    expect(json.status).toBe(0);
    const list = RuleInfo.array().parse(JSON.parse(json.stdout));
    const byId = Object.fromEntries(list.map((r) => [r.id, r]));
    expect(byId.INFO_UNSUPPORTED_SYNTAX!.level).toBe("off");
    expect(byId.WARN_CONTEXT_BLOAT!.changed).toEqual({ tokens: 6000 });
    expect(byId.FIN_CONTEXT_SNOWBALL!.source).toBe("session-logs");
    expect(byId.FIN_CONTEXT_SNOWBALL!.options).toEqual({ steps: 35, heavySteps: 10 });

    const text = rules().stdout;
    expect(text).toMatch(/INFO_UNSUPPORTED_SYNTAX\s+off/);
    expect(text).toMatch(/WARN_CONTEXT_BLOAT\s+on.*tokens=6000/);

    fs.writeFileSync(path.join(root, "ctxmedic.config.json"), JSON.stringify({ rules: { NOPE: "off" } }));
    const bad = rules();
    expect(bad.status).toBe(2);
    expect(bad.stderr).toContain("ctxmedic.config.json");
  });

  it("checkup --plugins loads plugins from node_modules and lists them in --json", () => {
    const root = project({ "CLAUDE.md": "TODO\n", "ctxmedic.config.json": JSON.stringify({ plugins: ["ctxmedic-plugin-demo"] }) });
    const dir = path.join(root, "node_modules", "ctxmedic-plugin-demo");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "ctxmedic-plugin-demo", version: "2.0.0", type: "module", main: "index.js" }));
    fs.writeFileSync(
      path.join(dir, "index.js"),
      `export default { namespace: "demo", rules: [{ id: "demo/NO_TODO", meta: { description: "No TODO lines", type: "suggestion", docs: "", fixable: false }, check: ({ files }) => files.filter((f) => f.text && f.text.includes("TODO")).map((f) => ({ ruleId: "demo/NO_TODO", severity: "warning", message: "todo", files: [f.rel], data: {} })) }] };`,
    );
    const on = ClinicalReport.parse(JSON.parse(run(["checkup", ".", "--json", "--plugins"], root).stdout));
    expect(on.plugins).toEqual([{ name: "ctxmedic-plugin-demo", version: "2.0.0", loaded: true, rules: ["demo/NO_TODO"] }]);
    const off = run(["checkup", "."], root);
    expect(off.stdout).toContain("plugins not loaded: ctxmedic-plugin-demo");
  });
});

