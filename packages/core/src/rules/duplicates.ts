import fs from "node:fs";
import path from "node:path";
import type { FixOp, ScannedFile } from "../schema.js";
import { DUPLICATE_SIMILARITY, type Rule } from "./types.js";

const norm = (text: string) =>
  new Set(
    text
      .split("\n")
      .map((l) => l.toLowerCase().replace(/\s+/g, " ").trim())
      .filter((l) => l.length >= 8),
  );

/** Jaccard similarity of normalized line sets (ADR-010). */
export function similarity(a: string, b: string): number {
  const A = norm(a);
  const B = norm(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const l of A) if (B.has(l)) inter++;
  return inter / (A.size + B.size - inter);
}

const HUB = ".ai/INSTRUCTIONS.md";

/** Hub-and-spoke: one canonical file in `.ai/`, the originals become relative symlinks. Nothing is lost:
 * lines that exist only in the smaller file are appended under a "merged" heading. */
function hubFix(root: string, a: ScannedFile, b: ScannedFile): FixOp[] {
  const [big, small] = a.text!.length >= b.text!.length ? [a, b] : [b, a];
  const have = norm(big.text!);
  const extra = small.text!.split("\n").filter((l) => {
    const n = l.toLowerCase().replace(/\s+/g, " ").trim();
    return n.length >= 8 && !have.has(n);
  });
  let content = big.text!;
  if (extra.length) content += `\n\n## Merged from ${small.rel}\n\n${extra.join("\n")}\n`;
  const hub = path.join(root, HUB);
  if (fs.existsSync(hub)) return []; // never overwrite an existing hub automatically
  return [
    { kind: "write", path: hub, content },
    ...[big, small].map((f) => ({ kind: "symlink" as const, path: f.path, target: path.relative(path.dirname(f.path), hub) })),
  ];
}

export const duplicates: Rule = {
  id: "WARN_DUPLICATE_RULES",
  check: ({ root, files }) => {
    const docs = files.filter((f) => f.role === "instructions" && f.text && !f.broken);
    const out = [];
    const seen = new Set<string>();
    for (let i = 0; i < docs.length; i++)
      for (let j = i + 1; j < docs.length; j++) {
        const a = docs[i]!;
        const b = docs[j]!;
        if ((a.realpath ?? a.path) === (b.realpath ?? b.path)) continue; // already symlinked together
        const key = [a.realpath ?? a.path, b.realpath ?? b.path].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        const sim = similarity(a.text!, b.text!);
        if (sim <= DUPLICATE_SIMILARITY) continue;
        const ops = a.scope === "project" && b.scope === "project" && !a.isSymlink && !b.isSymlink ? hubFix(root, a, b) : [];
        out.push({
          ruleId: "WARN_DUPLICATE_RULES" as const,
          severity: "warning" as const,
          message: `${a.rel} and ${b.rel} are ${Math.round(sim * 100)}% identical`,
          files: [a.rel, b.rel],
          data: { similarity: sim, wastedTokens: Math.min(a.tokens, b.tokens), hub: HUB },
          fix: ops.length ? { title: `Merge into ${HUB} and symlink both files to it`, ops } : undefined,
        });
      }
    return out;
  },
};
