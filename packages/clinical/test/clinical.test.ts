import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Finding } from "@ctxmedic/core";
import { askAi, checkup, DEFAULT_SCAN, diagnose, healthScore, loadHistory, resolveLang, scanSettings, treat } from "@ctxmedic/clinical";

const f = (ruleId: Finding["ruleId"], severity: Finding["severity"], extra: Partial<Finding> = {}): Finding => ({ ruleId, severity, message: ruleId, files: [], data: {}, ...extra });

describe("health score", () => {
  it("is deterministic, clamped and capped per rule", () => {
    expect(healthScore([])).toBe(100);
    expect(healthScore([f("CRIT_SECRET_LEAK", "critical")])).toBe(75);
    // five criticals from one rule cost at most 2×25
    expect(healthScore(Array.from({ length: 5 }, () => f("CRIT_SECRET_LEAK", "critical")))).toBe(50);
    const many = (["ERR_BROKEN_LINK", "CRIT_SECRET_LEAK", "WARN_CONTEXT_BLOAT", "FIN_CACHE_MISS", "ERR_INVALID_SKILL"] as const).map((r) => f(r, "critical"));
    expect(healthScore(many)).toBe(0);
  });
  it("orders by triage and numbers prescriptions", () => {
    const dx = diagnose([f("INFO_UNSUPPORTED_SYNTAX", "info"), f("CRIT_SECRET_LEAK", "critical")], "en");
    expect(dx.map((d) => d.rx.id)).toEqual(["RX-01", "RX-02"]);
    expect(dx[0]!.triage).toBe("resuscitation");
    expect(dx[0]!.diagnosis).toBe("Credential Hemorrhage");
    expect(dx[0]!.rx.healthGain).toBe(25);
  });
  it("falls back to English for unsupported languages", () => {
    expect(resolveLang("uk")).toBe("en");
    expect(resolveLang("EN-us")).toBe("en");
  });
});

describe("checkup + treat", () => {
  let root: string;
  beforeAll(() => {
    process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
    root = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-proj-"));
    fs.writeFileSync(path.join(root, ".cursorrules"), "Use TypeScript strict mode everywhere.");
    fs.mkdirSync(path.join(root, "dist"));
  });
  it("records history and improves after treatment", async () => {
    const r1 = await checkup({ root, lang: "en" });
    const rx = r1.diagnoses.find((d) => d.code === "FIN_BLOAT_IGNORE")!.rx;
    expect(rx.autoFix).toBe(true);
    const res = await treat(rx.id, { root, lang: "en" });
    expect(res.result?.applied[0]).toContain(".cursorignore");
    const r2 = await checkup({ root, lang: "en" });
    expect(r2.healthScore).toBeGreaterThan(r1.healthScore);
    expect(r2.previous?.healthScore).toBe(r1.healthScore);
    expect(loadHistory(fs.realpathSync(root)).length + loadHistory(root).length).toBeGreaterThanOrEqual(2);
  });
});

describe("history compares like with like", () => {
  let root: string;
  beforeEach(() => {
    process.env.CTXMEDIC_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-home-"));
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ctxmedic-proj-")));
    fs.writeFileSync(path.join(root, ".cursorrules"), "Use TypeScript strict mode everywhere.");
  });

  it("a --no-global run does not change the trend of full runs", async () => {
    const full = await checkup({ root, lang: "en", finops: false });
    const partial = await checkup({ root, lang: "en", finops: false, global: false });
    expect(partial.previous).toBeNull();
    const again = await checkup({ root, lang: "en", finops: false });
    expect(again.previous?.at).toBe(full.generatedAt);
    expect(loadHistory(root, scanSettings({ finops: false })).map((v) => v.at)).toEqual([full.generatedAt, again.generatedAt]);
    expect(loadHistory(root)).toHaveLength(3);
  });

  it("ignores --days when session logs were not analyzed", async () => {
    const a = await checkup({ root, lang: "en", finops: false, days: 7 });
    expect((await checkup({ root, lang: "en", finops: false, days: 90 })).previous?.at).toBe(a.generatedAt);
    expect(loadHistory(root, scanSettings({ days: 7 }))).toHaveLength(0);
  });

  it("loads v0.1.0 entries without scan settings as default runs", async () => {
    const home = path.join(process.env.CTXMEDIC_HOME!, ".ctxmedic");
    fs.mkdirSync(home, { recursive: true });
    const old = { at: "2026-11-01T00:00:00.000Z", root, healthScore: 50, counts: { resuscitation: 0, therapy: 1, preventive: 0 }, potentialMonthlySavingsUsd: 0 };
    fs.writeFileSync(path.join(home, "history.json"), JSON.stringify([old]));
    expect(loadHistory(root)[0]!.scan).toEqual(DEFAULT_SCAN);
    expect((await checkup({ root, lang: "en" })).previous?.healthScore).toBe(50);
    expect((await checkup({ root, lang: "en", global: false })).previous).toBeNull();
  });
});

type Seen = { url?: string; headers?: http.IncomingHttpHeaders; body?: any };
const sse = (events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const text = (index: number, t: string) => [
  { type: "content_block_start", index, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index, delta: { type: "text_delta", text: t } },
  { type: "content_block_stop", index },
];
const start = (model: string) => ({ type: "message_start", message: { model } });
const stop = (reason: string) => ({ type: "message_delta", delta: { stop_reason: reason } });

/** Runs `fn` against a fake Anthropic API; `reply` writes the response (null: never answer). */
async function withApi(reply: object[] | null, env: Record<string, string>, fn: (seen: Seen) => Promise<void>, status = 200) {
  const seen: Seen = {};
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      Object.assign(seen, { url: req.url, headers: req.headers, body: JSON.parse(raw) });
      if (!reply) return;
      if (status !== 200) return res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(reply[0]));
      res.setHeader("content-type", "text/event-stream");
      res.end(sse(reply));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const saved = { ...process.env };
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.CTXMEDIC_AI_MODEL;
  Object.assign(process.env, env);
  try {
    await fn(seen);
  } finally {
    process.env = saved;
    server.closeAllConnections();
    server.close();
  }
}

describe("consult --ai", () => {
  it("streams the Anthropic Messages API without the SDK and opts into fallbacks", async () => {
    const reply = [start("claude-opus-5-5"), ...text(0, "a"), { type: "content_block_start", index: 1, content_block: { type: "tool_use" } }, ...text(2, "b"), stop("end_turn"), { type: "message_stop" }];
    await withApi(reply, {}, async (seen) => {
      const progress: number[] = [];
      expect(await askAi("anthropic", "hi", (n) => progress.push(n))).toEqual({ text: "a\nb", model: "claude-opus-5-5", refused: false });
      expect(progress.at(-1)).toBe(2);
      expect(seen.url).toBe("/v1/messages");
      expect(seen.headers?.["x-api-key"]).toBe("test-key");
      expect(seen.headers?.["anthropic-version"]).toBe("2023-06-01");
      expect(seen.headers?.["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
      expect(seen.body).toMatchObject({ stream: true, fallbacks: "default", messages: [{ role: "user", content: "hi" }] });
    });
  });

  it("drops the declined partial and names the fallback model", async () => {
    const reply = [
      start("claude-opus-5-5"),
      ...text(0, "partial from the declined model"),
      { type: "content_block_start", index: 1, content_block: { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } } },
      { type: "content_block_stop", index: 1 },
      ...text(2, "review"),
      stop("end_turn"),
    ];
    await withApi(reply, {}, async () => {
      expect(await askAi("anthropic", "hi")).toEqual({ text: "review", model: "claude-opus-4-8", refused: false });
    });
  });

  it("reports a refusal when the whole chain declines", async () => {
    await withApi([start("claude-opus-5-5"), stop("refusal")], {}, async () => {
      expect((await askAi("anthropic", "hi")).refused).toBe(true);
    });
  });

  it("sends no fallbacks for an overridden model", async () => {
    await withApi([start("claude-haiku-5-5"), ...text(0, "ok"), stop("end_turn")], { CTXMEDIC_AI_MODEL: "claude-haiku-5-5" }, async (seen) => {
      expect((await askAi("anthropic", "hi")).text).toBe("ok");
      expect(seen.body.fallbacks).toBeUndefined();
      expect(seen.headers?.["anthropic-beta"]).toBeUndefined();
    });
  });

  it("shows the API's reason for an HTTP error", async () => {
    const body = { type: "error", error: { type: "invalid_request_error", message: "fallbacks: not supported" } };
    await withApi([body], {}, async () => {
      await expect(askAi("anthropic", "hi")).rejects.toThrow("Anthropic: HTTP 400 (fallbacks: not supported)");
    }, 400);
  });

  it("times out when no data arrives", async () => {
    await withApi(null, { CTXMEDIC_AI_TIMEOUT_MS: "50" }, async () => {
      await expect(askAi("anthropic", "hi")).rejects.toThrow("timeout");
    });
  });
});
