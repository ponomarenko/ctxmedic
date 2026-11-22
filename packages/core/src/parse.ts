import { parse as parseYaml } from "yaml";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

export interface Frontmatter {
  data: Record<string, unknown> | null;
  body: string;
  error?: string;
}

/** Splits `---\nyaml\n---\nbody`. `data` is null when there is no frontmatter. */
export function parseFrontmatter(text: string): Frontmatter {
  const m = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { data: null, body: text };
  const body = text.slice(m[0].length);
  try {
    const data = parseYaml(m[1]!);
    if (data && typeof data === "object" && !Array.isArray(data)) return { data: data as Record<string, unknown>, body };
    return { data: {}, body, error: "frontmatter is not a mapping" };
  } catch (e) {
    return { data: {}, body, error: (e as Error).message.split("\n")[0] };
  }
}

export function parseJsonLoose(text: string): unknown {
  const errors: ParseError[] = [];
  const v = parseJsonc(text, errors, { allowTrailingComma: true });
  return errors.length && v === undefined ? undefined : v;
}

export function parseConfig(file: string, text: string): unknown {
  try {
    return file.endsWith(".toml") ? parseToml(text) : parseJsonLoose(text);
  } catch {
    return undefined;
  }
}

/** MCP server names configured in a JSON/TOML config (Claude, Cursor, Windsurf, Codex, OpenCode shapes). */
export function mcpServers(file: string, text: string, projectRoot?: string): Record<string, Record<string, unknown>> {
  const cfg = parseConfig(file, text) as Record<string, any> | undefined;
  if (!cfg || typeof cfg !== "object") return {};
  const out: Record<string, Record<string, unknown>> = {};
  const add = (o: unknown) => {
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) out[k] = (v ?? {}) as Record<string, unknown>;
  };
  add(cfg.mcpServers);
  add(cfg.mcp_servers);
  add(cfg.mcp);
  // ~/.claude.json keeps per-project servers under projects[<abs path>].mcpServers
  if (projectRoot && cfg.projects?.[projectRoot]) add(cfg.projects[projectRoot].mcpServers);
  return out;
}
