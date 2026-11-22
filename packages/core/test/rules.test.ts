import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { applyFix, examine, findSecrets, redactSecrets, similarity, type Examination } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";

const shared = Array.from({ length: 40 }, (_, i) => `- Always follow coding convention number ${i} carefully.`).join("\n");

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-"));
  const w = (p: string, c: string) => (fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true }), fs.writeFileSync(path.join(root, p), c));
  w("CLAUDE.md", `# Project\n${shared}\n${"Lorem ipsum dolor sit amet. ".repeat(900)}\n`);
  w("AGENTS.md", `# Project\n${shared}\n@docs/extra.md\n`);
  w(".claude/skills/bad/SKILL.md", "no frontmatter here");
  w(".claude/skills/good/SKILL.md", "---\nname: good\ndescription: Formats SQL. Use when the user asks to format or lint SQL queries.\n---\nbody");
  w(".mcp.json", JSON.stringify({ mcpServers: { x: { env: { ANTHROPIC_API_KEY: "sk-ant-api03-" + "a1B2c3D4".repeat(5) } } } }));
  w(".cursor/rules/a.mdc", "---\nalwaysApply: true\n---\nrule");
  fs.mkdirSync(path.join(root, "node_modules"));
  fs.symlinkSync("../missing.md", path.join(root, ".claude/skills/ghost"));
  return root;
}

describe("rules", () => {
  let root: string;
  let ex: Examination;
  beforeAll(async () => {
    process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
    root = fixture();
    ex = await examine(root, harnesses);
  });
  const ids = () => ex.findings.map((f) => f.ruleId);

  it("detects each problem", () => {
    expect(ids()).toContain("ERR_BROKEN_LINK");
    expect(ids()).toContain("WARN_CONTEXT_BLOAT");
    expect(ids()).toContain("ERR_INVALID_SKILL");
    expect(ids()).toContain("CRIT_SECRET_LEAK");
    expect(ids()).toContain("INFO_UNSUPPORTED_SYNTAX"); // @import in AGENTS.md, read by codex/opencode
    expect(ids()).toContain("FIN_BLOAT_IGNORE");
    expect(ex.findings.filter((f) => f.ruleId === "ERR_INVALID_SKILL")).toHaveLength(1);
    expect(ex.vitals.harnesses).toEqual(expect.arrayContaining(["claude-code", "codex", "cursor"]));
  });

  it("never prints the raw secret", () => {
    expect(JSON.stringify(ex.findings)).not.toContain("a1B2c3D4a1B2c3D4");
  });

  it("applies the .cursorignore fix with a backup and dry-run first", async () => {
    const f = ex.findings.find((x) => x.ruleId === "FIN_BLOAT_IGNORE")!;
    const dry = await applyFix(f.fix!, { root, dryRun: true });
    expect(dry.dryRun).toBe(true);
    expect(fs.existsSync(path.join(root, ".cursorignore"))).toBe(false);
    const res = await applyFix(f.fix!, { root });
    expect(fs.readFileSync(path.join(root, ".cursorignore"), "utf8")).toContain("node_modules/");
    expect(fs.existsSync(path.join(res.backupDir, "manifest.json"))).toBe(true);
  });

  it("refuses to write outside the root", async () => {
    await expect(applyFix({ title: "x", ops: [{ kind: "write", path: "/tmp/../etc/ctxmedic", content: "" }] }, { root })).rejects.toThrow(/outside/);
  });
});

describe("helpers", () => {
  it("similarity", () => {
    expect(similarity(shared, shared + "\nanother extra line here")).toBeGreaterThan(0.9);
    expect(similarity(shared, "totally different content here")).toBe(0);
  });
  it("secrets", () => {
    const t = `token = "ghp_${"x".repeat(36)}"\nOPENAI_API_KEY="Zq8vN3pL0aR7tY2mK9sD4fH6"`;
    expect(findSecrets(t)).toHaveLength(2);
    expect(redactSecrets(t)).not.toContain("Zq8vN3pL0aR7tY2mK9sD4fH6");
  });
});

describe("duplicates", () => {
  it("offers a lossless hub-and-spoke merge", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-dup-"));
    fs.writeFileSync(path.join(root, "CLAUDE.md"), shared + "\nOnly in claude: use pnpm for everything.");
    fs.writeFileSync(path.join(root, "AGENTS.md"), shared);
    const ex = await examine(root, harnesses, { global: false });
    const dup = ex.findings.find((f) => f.ruleId === "WARN_DUPLICATE_RULES")!;
    await applyFix(dup.fix!, { root });
    expect(fs.lstatSync(path.join(root, "AGENTS.md")).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("Only in claude");
    const again = await examine(root, harnesses, { global: false });
    expect(again.findings.some((f) => f.ruleId === "WARN_DUPLICATE_RULES")).toBe(false);
  });
});
