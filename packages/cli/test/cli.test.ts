import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { ClinicalReport } from "@ctxmedic/clinical";

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
});
