import { execFileSync } from "node:child_process";
import path from "node:path";

function git(cwd: string, args: string[]): { code: number; out: string } {
  try {
    return { code: 0, out: execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"], encoding: "utf8" }) };
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    return { code: err.status ?? 128, out: err.stdout ?? "" };
  }
}

export const isGitRepo = (root: string) => git(root, ["rev-parse", "--is-inside-work-tree"]).code === 0;

/** true = ignored, false = tracked/trackable, null = not in a git repo. */
export function isGitIgnored(file: string): boolean | null {
  const dir = path.dirname(file);
  if (!isGitRepo(dir)) return null;
  return git(dir, ["check-ignore", "-q", file]).code === 0;
}

/** Files (absolute) among `files` with uncommitted changes. Empty outside git. */
export function dirtyFiles(root: string, files: string[]): string[] {
  if (!files.length || !isGitRepo(root)) return [];
  const { out } = git(root, ["status", "--porcelain", "--", ...files]);
  const top = git(root, ["rev-parse", "--show-toplevel"]).out.trim();
  return out
    .split("\n")
    .filter(Boolean)
    .map((l) => path.join(top, l.slice(3).trim()));
}
