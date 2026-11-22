import { HarnessProfile } from "@ctxmedic/core";

const p = (x: unknown) => HarnessProfile.parse(x);

/** Declarative registry of supported AI coding tools. Order matters only for display. */
export const harnesses: HarnessProfile[] = [
  p({
    id: "claude-code",
    name: "Claude Code",
    contextLimit: 200_000,
    files: {
      instructions: { project: ["CLAUDE.md", "CLAUDE.local.md", ".claude/CLAUDE.md"], global: ["~/.claude/CLAUDE.md"] },
      rules: { project: [".claude/rules/**/*.md"], global: ["~/.claude/rules/**/*.md"] },
      skill: { project: [".claude/skills/*/SKILL.md"], global: ["~/.claude/skills/*/SKILL.md"] },
      mcp: { project: [".mcp.json"], global: ["~/.claude.json"] },
    },
    syntax: ["@import"],
    logs: ["~/.claude/projects/**/*.jsonl"],
  }),
  p({
    id: "cursor",
    name: "Cursor",
    contextLimit: 200_000,
    files: {
      instructions: { project: [".cursorrules"] },
      rules: { project: [".cursor/rules/**/*.mdc"] },
      mcp: { project: [".cursor/mcp.json"], global: ["~/.cursor/mcp.json"] },
    },
    syntax: ["alwaysApply", "globs", "description"],
    ignoreFile: ".cursorignore",
    logs: ["~/.cursor/projects/*/agent-transcripts/*.jsonl"],
  }),
  p({
    id: "windsurf",
    name: "Windsurf",
    contextLimit: 200_000,
    files: {
      instructions: { project: [".windsurfrules"], global: ["~/.codeium/windsurf/memories/global_rules.md"] },
      rules: { project: [".windsurf/rules/**/*.md"] },
      mcp: { global: ["~/.codeium/windsurf/mcp_config.json"] },
    },
    syntax: ["trigger", "globs", "description"],
    ignoreFile: ".codeiumignore",
  }),
  p({
    id: "codex",
    name: "Codex CLI",
    contextLimit: 272_000,
    files: {
      instructions: { project: ["AGENTS.md", "AGENTS.override.md"], global: ["~/.codex/AGENTS.md"] },
      mcp: { global: ["~/.codex/config.toml"] },
    },
    syntax: [],
    logs: ["~/.codex/sessions/**/rollout-*.jsonl"],
  }),
  p({
    id: "opencode",
    name: "OpenCode",
    contextLimit: 200_000,
    files: {
      instructions: { project: ["AGENTS.md"], global: ["~/.config/opencode/AGENTS.md"] },
      mcp: { project: ["opencode.json"], global: ["~/.config/opencode/opencode.json"] },
    },
    syntax: [],
  }),
  p({
    id: "copilot",
    name: "GitHub Copilot",
    contextLimit: 128_000,
    files: {
      instructions: { project: [".github/copilot-instructions.md"] },
      rules: { project: [".github/instructions/**/*.instructions.md"] },
      mcp: { project: [".vscode/mcp.json"] },
    },
    syntax: ["applyTo"],
  }),
  p({
    id: "cline",
    name: "Cline",
    contextLimit: 200_000,
    files: { instructions: { project: [".clinerules"] }, rules: { project: [".clinerules/**/*.md"] } },
    syntax: [],
  }),
];

export const harnessById = (id: string) => harnesses.find((h) => h.id === id);
