import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { z } from "zod";
import type { Finding } from "../schema.js";
import { docsUrl, type Rule } from "./types.js";

const Options = z.object({
  /** Globs of references that are never checked (build output may not exist yet). */
  allow: z.array(z.string()).default(["node_modules/**", "dist/**", "build/**", "coverage/**", "out/**"]),
  /** Check `npm|pnpm|yarn run <script>` against package.json scripts. */
  commands: z.boolean().default(true),
});

const FENCE = /^\s*(```|~~~)/;
const INLINE = /`([^`\n]+)`/g;
const LINK = /\[[^\]\n]*\]\(([^)\s]+)\)/g;
const IMPORT = /^@([~\w./-]+\.\w+)\s*$/; // Claude Code `@path` import on its own line
const RUN = /\b(?:npm|pnpm|yarn) run ([\w:.-]+)/g;
const EXT = /\.(md|mdc|mdx|txt|ts|tsx|js|jsx|mjs|cjs|json|jsonc|ya?ml|toml|py|go|rs|rb|java|kt|sh|css|html|sql)$/i;

/**
 * Looks like a project path: no scheme, glob, placeholder or space, and a folder in it. Bare names (`schema.ts`,
 * `rules/`) are skipped: prose uses them for files of whatever package it is talking about.
 */
function pathLike(ref: string): boolean {
  if (/[\s:*?{}<>|"'$]/.test(ref) || ref.includes("...") || /(^|\/)path\/to\//.test(ref)) return false;
  if (ref.startsWith("/") || ref.startsWith("~") || ref.startsWith("-")) return false; // absolute, home, or a CLI flag
  if (ref.startsWith("@") && !EXT.test(ref)) return false; // @scope/package
  return ref.replace(/\/$/, "").includes("/");
}

/** Paths and commands in one instruction file that point at nothing. */
export function staleReferences(text: string, exists: (ref: string) => boolean, scripts: Set<string> | null): { line: number; ref: string; kind: "path" | "script" }[] {
  const out: { line: number; ref: string; kind: "path" | "script" }[] = [];
  const seen = new Set<string>();
  let fenced = false;
  text.split("\n").forEach((raw, i) => {
    const line = i + 1;
    if (FENCE.test(raw)) return void (fenced = !fenced);
    if (scripts)
      for (const m of raw.matchAll(RUN)) if (!scripts.has(m[1]!) && !seen.has(`s:${m[1]}`)) seen.add(`s:${m[1]}`), out.push({ line, ref: m[1]!, kind: "script" });
    if (fenced) return; // paths in code blocks are mostly examples
    const refs = [...raw.matchAll(INLINE)].map((m) => m[1]!.trim()).concat([...raw.matchAll(LINK)].map((m) => m[1]!.split("#")[0]!));
    const imp = IMPORT.exec(raw.trim());
    if (imp) refs.push(imp[1]!);
    for (const ref of refs.map((r) => r.replace(/^\.\//, "").replace(/[.,;]$/, ""))) {
      if (!ref || seen.has(`p:${ref}`) || !pathLike(ref) || exists(ref)) continue;
      seen.add(`p:${ref}`);
      out.push({ line, ref, kind: "path" });
    }
  });
  return out;
}

export const staleReference: Rule<z.infer<typeof Options>> = {
  id: "WARN_STALE_REFERENCE",
  meta: {
    description: "Paths and scripts named in instructions must exist",
    type: "problem",
    docs: docsUrl("WARN_STALE_REFERENCE"),
    fixable: false,
    options: Options,
  },
  check: ({ root, files }, { allow, commands }) => {
    const allowed = allow.length ? picomatch(allow, { dot: true }) : () => false;
    let scripts: Set<string> | null = null;
    try {
      if (commands) scripts = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {}));
    } catch {
      /* no package.json: scripts are not checked */
    }
    // Monorepos shorten paths ("core/src/x.ts" for "packages/core/src/x.ts"): also try each top-level folder.
    const tops = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => path.join(root, e.name));
    const out: Finding[] = [];
    for (const f of files) {
      // Global files name paths of many projects; only project files are checked.
      if (f.scope !== "project" || !f.text || !["instructions", "rules", "skill"].includes(f.role)) continue;
      const dir = path.dirname(f.path);
      const exists = (ref: string) => allowed(ref) || [root, dir, ...tops].some((base) => fs.existsSync(path.resolve(base, ref)));
      for (const s of staleReferences(f.text, exists, scripts))
        out.push({
          ruleId: "WARN_STALE_REFERENCE",
          severity: "warning",
          message: s.kind === "path" ? `${f.rel}:${s.line}: ${s.ref} does not exist` : `${f.rel}:${s.line}: package.json has no "${s.ref}" script`,
          files: [f.rel],
          line: s.line,
          data: { reference: s.ref, kind: s.kind },
        });
    }
    return out;
  },
};
