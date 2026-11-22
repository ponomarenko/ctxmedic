import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { applyFix, examine, listBackups, restoreBackup, type Finding } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";

const shared = Array.from({ length: 40 }, (_, i) => `- Always follow coding convention number ${i} carefully.`).join("\n");
let root: string;

/** Path → file bytes or symlink target, for byte-identical comparison (backups excluded). */
function state(dir: string) {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (rel.startsWith(".ctxmedic")) continue;
    const p = path.join(dir, rel);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) out[rel] = `-> ${fs.readlinkSync(p)}`;
    else if (st.isFile()) out[rel] = fs.readFileSync(p, "base64");
  }
  return out;
}
const fixFor = async (pred: (f: Finding) => boolean) => (await examine(root, harnesses, { global: false })).findings.find((f) => pred(f) && f.fix)!.fix!;

beforeEach(() => {
  process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-restore-")));
  fs.writeFileSync(path.join(root, "CLAUDE.md"), `# Project\n${shared}\nOnly in Claude: use pnpm workspaces.\n`);
  fs.writeFileSync(path.join(root, "AGENTS.md"), `# Project\n${shared}\n`);
  fs.mkdirSync(path.join(root, ".cursor/rules"), { recursive: true });
  fs.writeFileSync(path.join(root, "rules.mdc"), "---\nalwaysApply: true\n---\nrule");
  fs.symlinkSync(path.join(root, "rules.mdc"), path.join(root, ".cursor/rules/a.mdc"));
});

describe("restore", () => {
  it("undoes the duplicate-rules fix byte for byte", async () => {
    const before = state(root);
    await applyFix(await fixFor((f) => f.ruleId === "WARN_DUPLICATE_RULES"), { root });
    expect(fs.lstatSync(path.join(root, "CLAUDE.md")).isSymbolicLink()).toBe(true);

    const r = await restoreBackup("latest", { root });
    expect(r.restored).toContain("remove  .ai/INSTRUCTIONS.md");
    expect(state(root)).toEqual(before);
  });

  it("restores the original absolute symlink", async () => {
    const before = state(root);
    await applyFix(await fixFor((f) => f.ruleId === "ERR_BROKEN_LINK"), { root });
    expect(fs.readlinkSync(path.join(root, ".cursor/rules/a.mdc"))).toBe("../../rules.mdc");
    await restoreBackup("latest", { root });
    expect(state(root)).toEqual(before);
  });

  it("lists backups newest first and restores one by id", async () => {
    await applyFix(await fixFor((f) => f.ruleId === "ERR_BROKEN_LINK"), { root });
    await new Promise((r) => setTimeout(r, 5));
    await applyFix(await fixFor((f) => f.ruleId === "WARN_DUPLICATE_RULES"), { root });
    const all = await listBackups(root);
    expect(all.map((b) => b.title)).toEqual([expect.stringMatching(/^Merge/), expect.stringMatching(/relative symlink/)]);
    expect((await restoreBackup(all[1]!.id, { root })).title).toMatch(/relative symlink/);
    await expect(restoreBackup("nope", { root })).rejects.toThrow(/not found/);
  });

  it("refuses when a file changed after the fix, unless --force; dry-run writes nothing", async () => {
    const before = state(root);
    await applyFix(await fixFor((f) => f.ruleId === "WARN_DUPLICATE_RULES"), { root });
    fs.appendFileSync(path.join(root, ".ai/INSTRUCTIONS.md"), "\nedited by hand\n");
    await expect(restoreBackup("latest", { root })).rejects.toThrow(/changed after the fix/);

    const edited = state(root);
    expect((await restoreBackup("latest", { root, force: true, dryRun: true })).dryRun).toBe(true);
    expect(state(root)).toEqual(edited);

    await restoreBackup("latest", { root, force: true });
    expect(state(root)).toEqual(before);
  });

  it("never writes outside the root, even with a tampered manifest", async () => {
    await applyFix(await fixFor((f) => f.ruleId === "ERR_BROKEN_LINK"), { root });
    const [b] = await listBackups(root);
    const file = path.join(root, ".ctxmedic/backups", b!.id, "manifest.json");
    const m = JSON.parse(fs.readFileSync(file, "utf8"));
    const victim = path.join(os.tmpdir(), `ctxmedic-victim-${b!.id}`);
    m.entries.push({ path: victim, existed: false });
    fs.writeFileSync(file, JSON.stringify(m));
    fs.writeFileSync(victim, "keep me");
    await expect(restoreBackup("latest", { root, force: true })).rejects.toThrow(/outside/);
    expect(fs.readFileSync(victim, "utf8")).toBe("keep me");

    m.entries = [{ path: path.join(root, "x"), existed: true, backup: "../../../../etc/hosts" }];
    fs.writeFileSync(file, JSON.stringify(m));
    await expect(restoreBackup("latest", { root, force: true })).rejects.toThrow(/invalid backup entry/);
  });
});
