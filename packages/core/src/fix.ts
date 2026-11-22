import fs from "node:fs/promises";
import path from "node:path";
import { dirtyFiles } from "./git.js";
import { FixPlan } from "./schema.js";

export interface FixResult {
  backupDir: string;
  applied: string[];
  dryRun: boolean;
}

export class FixRefusedError extends Error {}

export interface FixOptions {
  root: string;
  dryRun?: boolean;
  force?: boolean;
  /** Allow ops outside `root` (for example ~/.claude files). */
  global?: boolean;
}

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

/** Backs up, then applies a fix plan (ADR-006). Throws FixRefusedError before touching anything if unsafe. */
export async function applyFix(planIn: FixPlan, opts: FixOptions): Promise<FixResult> {
  const plan = FixPlan.parse(planIn);
  const root = path.resolve(opts.root);
  const targets = plan.ops.map((o) => path.resolve(o.path));
  for (const t of targets)
    if (path.relative(root, t).startsWith("..") && !opts.global)
      throw new FixRefusedError(`refusing to modify ${t}: outside ${root} (use --global)`);
  if (!opts.force) {
    const dirty = dirtyFiles(root, targets.filter((t) => !path.relative(root, t).startsWith("..")));
    if (dirty.length) throw new FixRefusedError(`uncommitted changes in ${dirty.join(", ")}; commit them or use --force`);
  }
  const backupDir = path.join(root, ".ctxmedic", "backups", stamp());
  const describe = plan.ops.map((o) => (o.kind === "write" ? `write ${o.path}` : `symlink ${o.path} -> ${o.target}`));
  if (opts.dryRun) return { backupDir, applied: describe, dryRun: true };

  const manifest: { title: string; createdAt: string; entries: Record<string, unknown>[] } = {
    title: plan.title,
    createdAt: new Date().toISOString(),
    entries: [],
  };
  await fs.mkdir(backupDir, { recursive: true });
  for (const t of targets) {
    const rel = path.relative(root, t).startsWith("..") ? path.join("_outside", t) : path.relative(root, t);
    let st;
    try {
      st = await fs.lstat(t);
    } catch {
      manifest.entries.push({ path: t, existed: false });
      continue;
    }
    if (st.isSymbolicLink()) manifest.entries.push({ path: t, existed: true, symlink: await fs.readlink(t) });
    else {
      const dest = path.join(backupDir, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(t, dest);
      manifest.entries.push({ path: t, existed: true, backup: rel });
    }
  }
  await fs.writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  for (const op of plan.ops) {
    await fs.mkdir(path.dirname(op.path), { recursive: true });
    // Unlink first so we never write through an existing symlink into its target.
    await fs.rm(op.path, { force: true });
    if (op.kind === "write") await fs.writeFile(op.path, op.content);
    else await fs.symlink(op.target, op.path);
  }
  return { backupDir, applied: describe, dryRun: false };
}
