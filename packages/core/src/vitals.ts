import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./parse.js";
import { countTokens } from "./tokens.js";
import type { HarnessProfile, ScannedFile } from "./schema.js";

export interface StartupLoad {
  tokens: number;
  files: { rel: string; tokens: number }[];
}

/** Rule files load at session start only when they are "always on". */
function alwaysOn(text: string): boolean {
  const { data } = parseFrontmatter(text);
  if (!data) return true;
  if (data.alwaysApply === true || data.trigger === "always_on" || data.applyTo === "**") return true;
  return !["globs", "paths", "applyTo", "trigger", "description", "alwaysApply"].some((k) => k in data);
}

/** Claude-style `@path` imports, one level deep. */
function importTokens(file: ScannedFile): { rel: string; tokens: number }[] {
  const out: { rel: string; tokens: number }[] = [];
  for (const m of (file.text ?? "").matchAll(/^@([~\w./-]+\.\w+)\s*$/gm)) {
    const p = path.resolve(path.dirname(file.path), m[1]!);
    try {
      out.push({ rel: m[1]!, tokens: countTokens(fs.readFileSync(p, "utf8")) });
    } catch {
      /* missing import is reported by ERR_BROKEN_LINK only for symlinks; ignore here */
    }
  }
  return out;
}

/** Tokens each harness loads before the user types anything. */
export function startupLoad(files: ScannedFile[], profiles: HarnessProfile[]): Record<string, StartupLoad> {
  const res: Record<string, StartupLoad> = {};
  for (const h of profiles) {
    const load: StartupLoad = { tokens: 0, files: [] };
    for (const f of files) {
      if (!f.harnesses.includes(h.id) || !f.text) continue;
      let t = 0;
      if (f.role === "instructions") {
        t = f.tokens;
        if (h.syntax.includes("@import")) for (const imp of importTokens(f)) load.files.push(imp), (load.tokens += imp.tokens);
      } else if (f.role === "rules" && alwaysOn(f.text)) t = f.tokens;
      else if (f.role === "skill") {
        const { data } = parseFrontmatter(f.text);
        t = countTokens(`${data?.name ?? ""} ${data?.description ?? ""}`);
      }
      if (t) load.files.push({ rel: f.rel, tokens: t }), (load.tokens += t);
    }
    if (load.files.length) res[h.id] = load;
  }
  return res;
}

export const detectedHarnesses = (files: ScannedFile[]) => [...new Set(files.flatMap((f) => f.harnesses))].sort();
