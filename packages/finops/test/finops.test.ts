import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { countTokens, examine } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";
import { analyze, costOf, loadCache, loadSessions, MCP_SCHEMA_TOKENS, parseClaude, parseCodex, unusedMcp } from "@ctxmedic/finops";
import { diagnose } from "@ctxmedic/clinical";

const now = new Date("2026-11-20T12:00:00Z");
const ts = (i: number) => new Date(now.getTime() - 86_400_000 + i * 1000).toISOString();

function claudeLine(id: string, i: number, model: string, ctx: number, tool?: string) {
  return JSON.stringify({
    type: "assistant",
    timestamp: ts(i),
    message: {
      id,
      model,
      content: tool ? [{ type: "tool_use", name: tool }] : [{ type: "text" }],
      usage: { input_tokens: ctx, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  });
}

let home: string;
let root: string;
beforeAll(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-proj-"));
  process.env.CTXMEDIC_HOME = home;
  const proj = path.join(home, ".claude/projects/p");
  fs.mkdirSync(proj, { recursive: true });
  // Snowball: 40 steps, 120k context, no cache, plus a duplicated line for the same message id.
  const long = Array.from({ length: 40 }, (_, i) => claudeLine(`m${i}`, i, "claude-sonnet-5-5", 120_000, i === 0 ? "mcp__github__search" : undefined));
  fs.writeFileSync(path.join(proj, "long.jsonl"), [...long, long[1], "not json"].join("\n"));
  // Overkill: three one-shot Opus sessions.
  for (const n of [1, 2, 3]) fs.writeFileSync(path.join(proj, `short${n}.jsonl`), claudeLine(`s${n}`, n, "claude-opus-5-5", 50_000));
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { github: {}, jira: {} } }));
  const cx = path.join(home, ".codex/sessions/2026/11/19");
  fs.mkdirSync(cx, { recursive: true });
  const tc = (total: number) => JSON.stringify({ timestamp: ts(5), type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { total_tokens: total }, last_token_usage: { input_tokens: 1000, cached_input_tokens: 800, output_tokens: 10 } } } });
  fs.writeFileSync(path.join(cx, "rollout-a.jsonl"), [JSON.stringify({ type: "turn_context", payload: { model: "gpt-5" } }), tc(1), tc(1), tc(2)].join("\n"));
});

describe("parsers", () => {
  it("dedupes Claude message ids and skips bad lines", async () => {
    const s = await parseClaude(path.join(home, ".claude/projects/p/long.jsonl"));
    expect(s.steps).toBe(40);
    expect(s.mcpCalls.github).toBe(1);
    expect(s.heavySteps).toBe(40);
  });
  it("Codex counts each new token_count once and splits cached input", async () => {
    const s = await parseCodex(path.join(home, ".codex/sessions/2026/11/19/rollout-a.jsonl"));
    expect(s.steps).toBe(2);
    expect(s.models["gpt-5"]).toMatchObject({ input: 400, cacheRead: 1600 });
  });
  it("costs", () => {
    expect(costOf("claude-opus-5-5", { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })).toBeCloseTo(24);
  });
});

describe("analyze", () => {
  it("finds all four money leaks and caches parsed logs", async () => {
    const ex = await examine(root, harnesses);
    const r = await analyze({ root, files: ex.files, days: 30, now });
    const ids = r.findings.map((f) => f.ruleId).sort();
    expect(ids).toEqual(["FIN_CACHE_MISS", "FIN_CONTEXT_SNOWBALL", "FIN_MODEL_OVERKILL", "FIN_UNUSED_MCP"]);
    expect(r.findings.find((f) => f.ruleId === "FIN_UNUSED_MCP")!.data.server).toBe("jira");
    expect(r.sessions).toBe(5);
    expect(r.costUsd).toBeGreaterThan(0);
    expect(r.potentialMonthlySavingsUsd).toBeGreaterThan(0);
    expect(Object.keys(loadCache().files)).toHaveLength(5);
  });
});

describe("MCP schema sizes", () => {
  const jiraTools = [
    { name: "mcp__jira__search", description: "Search Jira issues with JQL and return matching keys.", input_schema: { type: "object", properties: { jql: { type: "string" } } } },
    { name: "mcp__jira__create", description: "Create a Jira issue.", input_schema: { type: "object", properties: { summary: { type: "string" } } } },
  ];
  const write = (rel: string, lines: unknown[]) => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-log-")), rel);
    fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n"));
    return p;
  };

  it("Claude: measures tool definitions per server from api-request-shape", async () => {
    const shape = { type: "api-request-shape", shape: { system: [], tools: [{ name: "Read", description: "x".repeat(500), input_schema: {} }, ...jiraTools] } };
    const small = { type: "api-request-shape", shape: { tools: jiraTools.slice(0, 1) } };
    const s = await parseClaude(write("s.jsonl", [small, shape]));
    expect(Object.keys(s.mcpSchemaTokens)).toEqual(["jira"]);
    expect(s.mcpSchemaTokens.jira).toBe(countTokens(JSON.stringify(jiraTools)));
  });

  it("Codex: measures each mcp__<server> namespace in additional_tools", async () => {
    const tools = [
      { type: "namespace", name: "functions", tools: [{ type: "custom", name: "exec" }] },
      { type: "namespace", name: "mcp__jira", tools: jiraTools },
    ];
    const s = await parseCodex(write("rollout-x.jsonl", [{ type: "response_item", payload: { type: "additional_tools", role: "developer", tools } }]));
    expect(s.mcpSchemaTokens).toEqual({ jira: countTokens(JSON.stringify(jiraTools)) });
  });

  it("FIN_UNUSED_MCP uses the measured size and falls back to the estimate", async () => {
    const ex = await examine(root, harnesses);
    const sessions = await loadSessions(30, now);
    const base = unusedMcp({ sessions, days: 30, files: ex.files, root })[0]!;
    expect(base.data).toMatchObject({ server: "jira", schemaTokens: MCP_SCHEMA_TOKENS, estimated: true });

    const measured = sessions.map((s) => (s.harness === "claude-code" ? { ...s, mcpSchemaTokens: { jira: 4_321 } } : s));
    const f = unusedMcp({ sessions: measured, days: 30, files: ex.files, root })[0]!;
    expect(f.data).toMatchObject({ schemaTokens: 4_321, estimated: false });
    expect(f.monthlySavingsUsd!).toBeGreaterThan(base.monthlySavingsUsd!);
    expect(diagnose([f], "en")[0]!.prognosis).toContain("measured from session logs");
    expect(diagnose([base], "en")[0]!.prognosis).toContain("estimated at 1,500 per server");
  });
});
