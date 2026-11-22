import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { costOf } from "./pricing.js";

export interface Usage {
  steps: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  costUsd: number;
}

export interface SessionStats {
  file: string;
  harness: "claude-code" | "codex" | "cursor";
  start?: string;
  end?: string;
  steps: number;
  models: Record<string, Usage>;
  mcpCalls: Record<string, number>;
  compactions: number;
  maxContext: number;
  /** Steps whose prompt context exceeded SNOWBALL_CONTEXT, and the tokens above the healthy baseline. */
  heavySteps: number;
  heavyExcessTokens: number;
}

export const SNOWBALL_CONTEXT = 100_000;
export const HEALTHY_CONTEXT = 40_000;

const MCP = /^mcp__(.+?)(?:__|$)/;

function blank(file: string, harness: SessionStats["harness"]): SessionStats {
  return { file, harness, steps: 0, models: {}, mcpCalls: {}, compactions: 0, maxContext: 0, heavySteps: 0, heavyExcessTokens: 0 };
}

function addStep(s: SessionStats, model: string, u: { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h?: number }) {
  const m = (s.models[model] ??= { steps: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 });
  m.steps++;
  m.input += u.input;
  m.output += u.output;
  m.cacheRead += u.cacheRead;
  m.cacheWrite += u.cacheWrite;
  m.costUsd += costOf(model, u);
  s.steps++;
  const ctx = u.input + u.cacheRead + u.cacheWrite;
  s.maxContext = Math.max(s.maxContext, ctx);
  if (ctx > SNOWBALL_CONTEXT) s.heavySteps++, (s.heavyExcessTokens += ctx - HEALTHY_CONTEXT);
}

const mcp = (s: SessionStats, name: unknown): boolean => {
  const m = typeof name === "string" && MCP.exec(name);
  if (m) s.mcpCalls[m[1]!] = (s.mcpCalls[m[1]!] ?? 0) + 1;
  return Boolean(m);
};

async function* lines(file: string): AsyncGenerator<any> {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try {
      yield JSON.parse(line);
    } catch {
      /* malformed line: skip (ADR-011) */
    }
  }
}

const stamp = (s: SessionStats, ts: unknown) => {
  if (typeof ts !== "string") return;
  if (!s.start || ts < s.start) s.start = ts;
  if (!s.end || ts > s.end) s.end = ts;
};

/** Claude Code: ~/.claude/projects/<project>/<session>.jsonl */
export async function parseClaude(file: string): Promise<SessionStats> {
  const s = blank(file, "claude-code");
  const steps = new Map<string, { model: string; usage: any }>();
  for await (const l of lines(file)) {
    stamp(s, l.timestamp);
    if ((l.type === "system" && l.subtype === "compact_boundary") || l.isCompactSummary) s.compactions++;
    if (l.type !== "assistant" || !l.message?.usage) continue;
    const msg = l.message;
    if (msg.model === "<synthetic>") continue;
    // One API response is logged as several lines (one per content block) sharing message.id.
    steps.set(msg.id ?? l.uuid, { model: msg.model ?? "unknown", usage: msg.usage });
    for (const c of Array.isArray(msg.content) ? msg.content : []) if (c?.type === "tool_use") mcp(s, c.name);
  }
  for (const { model, usage: u } of steps.values())
    addStep(s, model, {
      input: u.input_tokens ?? 0,
      output: u.output_tokens ?? 0,
      cacheRead: u.cache_read_input_tokens ?? 0,
      cacheWrite: u.cache_creation_input_tokens ?? 0,
      cacheWrite1h: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
    });
  return s;
}

/** Codex CLI: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl */
export async function parseCodex(file: string): Promise<SessionStats> {
  const s = blank(file, "codex");
  let model = "gpt-5";
  let lastTotal = -1;
  for await (const l of lines(file)) {
    stamp(s, l.timestamp);
    const p = l.payload ?? {};
    if (l.type === "turn_context" && typeof p.model === "string") model = p.model;
    else if (l.type === "compacted") s.compactions++;
    else if (l.type === "response_item" && /function_call|custom_tool_call|mcp_tool_call/.test(p.type ?? "")) mcp(s, p.namespace) || mcp(s, p.name);
    else if (l.type === "event_msg" && p.type === "token_count" && p.info?.last_token_usage) {
      const total = p.info.total_token_usage?.total_tokens ?? -2;
      if (total === lastTotal) continue; // repeated rate-limit refresh, not a new step
      lastTotal = total;
      const u = p.info.last_token_usage;
      const cached = u.cached_input_tokens ?? 0;
      const write = u.cache_write_input_tokens ?? 0;
      // OpenAI input_tokens include the cached part.
      addStep(s, model, { input: Math.max(0, (u.input_tokens ?? 0) - cached - write), output: u.output_tokens ?? 0, cacheRead: cached, cacheWrite: write });
    }
  }
  return s;
}

/** Cursor agent transcripts carry no token usage: steps and tool calls only (best effort). */
export async function parseCursor(file: string): Promise<SessionStats> {
  const s = blank(file, "cursor");
  for await (const l of lines(file)) {
    stamp(s, l.timestamp);
    const role = l.role ?? l.message?.role;
    if (role !== "assistant") continue;
    s.steps++;
    const content = l.content ?? l.message?.content;
    for (const c of Array.isArray(content) ? content : []) if (c?.type === "tool_use" || c?.type === "tool-call") mcp(s, c.name ?? c.toolName);
  }
  if (!s.end) {
    const t = fs.statSync(file).mtime.toISOString();
    s.start ??= t;
    s.end = t;
  }
  return s;
}

export const LOG_SOURCES: { harness: SessionStats["harness"]; glob: string; parse: (f: string) => Promise<SessionStats> }[] = [
  { harness: "claude-code", glob: "~/.claude/projects/**/*.jsonl", parse: parseClaude },
  { harness: "codex", glob: "~/.codex/sessions/**/rollout-*.jsonl", parse: parseCodex },
  { harness: "cursor", glob: "~/.cursor/projects/*/agent-transcripts/*.jsonl", parse: parseCursor },
];

export const sessionName = (f: string) => path.basename(f, ".jsonl");
