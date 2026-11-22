import fs from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";
import { homeDir } from "./paths.js";
import { countTokens } from "./tokens.js";
import type { FileRole, HarnessProfile, ScannedFile } from "./schema.js";

const MAX_DEPTH = 6;
const MAX_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const isGlob = (s: string) => /[*?[\]{}]/.test(s);

interface Entry {
  abs: string;
  isSymlink: boolean;
  linkTarget?: string;
  broken: boolean;
  loop: boolean;
  realpath?: string;
  isFile: boolean;
}

async function inspect(abs: string): Promise<Entry | undefined> {
  let l;
  try {
    l = await fs.lstat(abs);
  } catch {
    return undefined;
  }
  const e: Entry = { abs, isSymlink: l.isSymbolicLink(), broken: false, loop: false, isFile: l.isFile() };
  if (e.isSymlink) {
    e.linkTarget = await fs.readlink(abs);
    try {
      const s = await fs.stat(abs);
      e.isFile = s.isFile();
      e.realpath = await fs.realpath(abs);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ELOOP") e.loop = true;
      else e.broken = true;
    }
  }
  return e;
}

/** Walks `dir` (following symlinked dirs, cycle-safe) and yields files plus any broken/looping links. */
async function walk(dir: string, depth: number, seen: Set<string>, out: Entry[]): Promise<void> {
  if (depth > MAX_DEPTH) return;
  let real: string;
  try {
    real = await fs.realpath(dir);
  } catch {
    return;
  }
  if (seen.has(real)) return;
  seen.add(real);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const e = await inspect(path.join(dir, name));
    if (!e) continue;
    if (e.broken || e.loop || e.isFile) out.push(e);
    else await walk(e.abs, depth + 1, seen, out);
  }
}

async function expand(base: string, pattern: string): Promise<Entry[]> {
  if (!isGlob(pattern)) {
    const e = await inspect(path.join(base, pattern));
    return e && (e.isFile || e.broken || e.loop) ? [e] : [];
  }
  const segs = pattern.split("/");
  const i = segs.findIndex(isGlob);
  const prefix = segs.slice(0, i).join("/");
  const found: Entry[] = [];
  await walk(path.join(base, prefix), 0, new Set(), found);
  const match = picomatch(pattern, { dot: true });
  // Broken links inside a walked config dir are always relevant, even if they cannot match the file pattern.
  return found.filter((e) => e.broken || e.loop || match(path.relative(base, e.abs).split(path.sep).join("/")));
}

export interface ScanOptions {
  /** Include files under the home directory (`~/...`). Default true. */
  global?: boolean;
}

export async function scan(root: string, profiles: HarnessProfile[], opts: ScanOptions = {}): Promise<ScannedFile[]> {
  root = path.resolve(root);
  const home = homeDir();
  const byPath = new Map<string, ScannedFile>();
  for (const h of profiles) {
    for (const [role, set] of Object.entries(h.files) as [FileRole, { project: string[]; global: string[] }][]) {
      const scopes: ["project" | "global", string[], string][] = [["project", set.project, root]];
      if (opts.global !== false) scopes.push(["global", set.global.map((g) => g.replace(/^~\//, "")), home]);
      for (const [scope, patterns, base] of scopes) {
        for (const pattern of patterns) {
          for (const e of await expand(base, pattern)) {
            const prev = byPath.get(e.abs);
            if (prev) {
              if (!prev.harnesses.includes(h.id)) prev.harnesses.push(h.id);
              continue;
            }
            let text: string | undefined;
            if (e.isFile && !e.broken) {
              try {
                const st = await fs.stat(e.abs);
                if (st.size <= MAX_BYTES) text = await fs.readFile(e.abs, "utf8");
              } catch {
                /* unreadable: keep entry without text */
              }
            }
            const inRoot = !path.relative(root, e.abs).startsWith("..");
            byPath.set(e.abs, {
              path: e.abs,
              rel: inRoot ? path.relative(root, e.abs) : "~/" + path.relative(home, e.abs),
              scope,
              role,
              harnesses: [h.id],
              isSymlink: e.isSymlink,
              linkTarget: e.linkTarget,
              broken: e.broken,
              loop: e.loop,
              realpath: e.realpath,
              text,
              tokens: role === "mcp" ? 0 : countTokens(text ?? ""),
            });
          }
        }
      }
    }
  }
  return [...byPath.values()].sort((a, b) => a.rel.localeCompare(b.rel));
}

/** Absolute paths of regular files matching a `~/`-relative or absolute glob (used for session logs). */
export async function findFiles(pattern: string): Promise<string[]> {
  const base = pattern.startsWith("~/") ? homeDir() : "/";
  const rel = pattern.replace(/^~\//, "").replace(/^\//, "");
  return (await expand(base, rel)).filter((e) => e.isFile && !e.broken).map((e) => e.abs);
}
