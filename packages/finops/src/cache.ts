import fs from "node:fs";
import path from "node:path";
import { stateDir } from "@ctxmedic/core";
import type { SessionStats } from "./parsers.js";

// Bump `v` whenever SessionStats or a parser changes, so stale aggregates are re-parsed.
interface CacheFile {
  v: 2;
  files: Record<string, { mtimeMs: number; size: number; stats: SessionStats }>;
}

const file = () => path.join(stateDir(), "cache.json");

export function loadCache(): CacheFile {
  try {
    const c = JSON.parse(fs.readFileSync(file(), "utf8"));
    if (c?.v === 2 && c.files) return c;
  } catch {
    /* missing or corrupt cache: start over */
  }
  return { v: 2, files: {} };
}

export function saveCache(c: CacheFile): void {
  fs.mkdirSync(stateDir(), { recursive: true });
  const tmp = file() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(c));
  fs.renameSync(tmp, file());
}

/** Parses only files whose mtime or size changed since the last run (ADR-011). */
export async function cachedParse(paths: string[], parse: (f: string) => Promise<SessionStats>, cache: CacheFile): Promise<{ stats: SessionStats[]; parsed: number }> {
  const stats: SessionStats[] = [];
  let parsed = 0;
  for (const p of paths) {
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    const hit = cache.files[p];
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) {
      stats.push(hit.stats);
      continue;
    }
    const s = await parse(p);
    parsed++;
    cache.files[p] = { mtimeMs: st.mtimeMs, size: st.size, stats: s };
    stats.push(s);
  }
  return { stats, parsed };
}
