import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { dirtyFiles } from "./git.js";
import { BackupManifest, FixPlan, type FixAfter } from "./schema.js";

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
const sha256 = (data: string | Buffer) => crypto.createHash("sha256").update(data).digest("hex");
const outside = (root: string, p: string) => {
  const rel = path.relative(root, p);
  return rel.startsWith("..") || path.isAbsolute(rel);
};
const backupsDir = (root: string) => path.join(path.resolve(root), ".ctxmedic", "backups");

/** Backs up, then applies a fix plan (ADR-006). Throws FixRefusedError before touching anything if unsafe. */
export async function applyFix(planIn: FixPlan, opts: FixOptions): Promise<FixResult> {
  const plan = FixPlan.parse(planIn);
  const root = path.resolve(opts.root);
  const targets = plan.ops.map((o) => path.resolve(o.path));
  for (const t of targets)
    if (outside(root, t) && !opts.global)
      throw new FixRefusedError(`refusing to modify ${t}: outside ${root} (use --global)`);
  if (!opts.force) {
    const dirty = dirtyFiles(root, targets.filter((t) => !outside(root, t)));
    if (dirty.length) throw new FixRefusedError(`uncommitted changes in ${dirty.join(", ")}; commit them or use --force`);
  }
  const backupDir = path.join(backupsDir(root), stamp());
  const describe = plan.ops.map((o) => (o.kind === "write" ? `write ${o.path}` : `symlink ${o.path} -> ${o.target}`));
  if (opts.dryRun) return { backupDir, applied: describe, dryRun: true };

  // The last op on a path decides what the fix leaves there.
  const after = new Map<string, FixAfter>(
    plan.ops.map((o) => [path.resolve(o.path), o.kind === "write" ? { kind: "write", sha256: sha256(o.content) } : { kind: "symlink", target: o.target }]),
  );
  const manifest: BackupManifest = { title: plan.title, createdAt: new Date().toISOString(), entries: [] };
  await fs.mkdir(backupDir, { recursive: true });
  for (const t of new Set(targets)) {
    const rel = outside(root, t) ? path.join("_outside", t) : path.relative(root, t);
    let st;
    try {
      st = await fs.lstat(t);
    } catch {
      manifest.entries.push({ path: t, existed: false, after: after.get(t) });
      continue;
    }
    if (st.isSymbolicLink()) manifest.entries.push({ path: t, existed: true, symlink: await fs.readlink(t), after: after.get(t) });
    else {
      const dest = path.join(backupDir, rel);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(t, dest);
      manifest.entries.push({ path: t, existed: true, backup: rel, after: after.get(t) });
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

export interface BackupInfo {
  id: string;
  title: string;
  createdAt: string;
}

/** Backups in `<root>/.ctxmedic/backups`, newest first. Folders without a valid manifest are skipped. */
export async function listBackups(root: string): Promise<BackupInfo[]> {
  const ids = await fs.readdir(backupsDir(root)).catch(() => [] as string[]);
  const out: BackupInfo[] = [];
  for (const id of ids) {
    const m = await readManifest(root, id).catch(() => null);
    if (m) out.push({ id, title: m.title, createdAt: m.createdAt });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

const readManifest = async (root: string, id: string) =>
  BackupManifest.parse(JSON.parse(await fs.readFile(path.join(backupsDir(root), id, "manifest.json"), "utf8")));

/** true when the path still holds exactly what the fix left there. */
async function unchanged(p: string, after: FixAfter): Promise<boolean> {
  const st = await fs.lstat(p).catch(() => null);
  if (!st) return false;
  if (after.kind === "symlink") return st.isSymbolicLink() && (await fs.readlink(p)) === after.target;
  return st.isFile() && sha256(await fs.readFile(p)) === after.sha256;
}

export interface RestoreResult {
  id: string;
  title: string;
  restored: string[];
  dryRun: boolean;
}

/**
 * Undoes one fix from its backup: copies files back, re-creates old symlinks, removes files the fix created.
 * Refuses (before touching anything) when a path is outside `root`, or changed after the fix unless `force`.
 */
export async function restoreBackup(idIn: string, opts: Omit<FixOptions, "global">): Promise<RestoreResult> {
  const root = path.resolve(opts.root);
  const all = await listBackups(root);
  const info = idIn === "latest" ? all[0] : all.find((b) => b.id === idIn);
  if (!info) throw new FixRefusedError(all.length ? `backup ${idIn} not found; run \`ctxmedic restore\` to list backups` : "no backups to restore");
  const dir = path.join(backupsDir(root), info.id);
  const manifest = await readManifest(root, info.id);

  for (const e of manifest.entries) {
    if (outside(root, e.path)) throw new FixRefusedError(`refusing to restore ${e.path}: outside ${root}`);
    if (e.backup && outside(dir, path.resolve(dir, e.backup))) throw new FixRefusedError(`invalid backup entry ${e.backup}`);
    if (opts.force) continue;
    if (!e.after) throw new FixRefusedError(`backup ${info.id} does not record what the fix wrote; use --force to restore anyway`);
    if (!(await unchanged(e.path, e.after))) throw new FixRefusedError(`${path.relative(root, e.path)} changed after the fix; use --force to overwrite it`);
  }

  const restored = manifest.entries.map((e) => `${e.existed ? "restore" : "remove "} ${path.relative(root, e.path)}`);
  if (opts.dryRun) return { id: info.id, title: info.title, restored, dryRun: true };
  for (const e of manifest.entries) {
    await fs.rm(e.path, { force: true });
    if (!e.existed) continue;
    await fs.mkdir(path.dirname(e.path), { recursive: true });
    if (e.symlink !== undefined) await fs.symlink(e.symlink, e.path);
    else if (e.backup) await fs.copyFile(path.join(dir, e.backup), e.path);
  }
  return { id: info.id, title: info.title, restored, dryRun: false };
}
