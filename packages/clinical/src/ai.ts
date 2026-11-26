import { examine, redactSecrets } from "@ctxmedic/core";
import { harnesses } from "@ctxmedic/harnesses";
import type { ClinicalReport } from "./schema.js";

export type AiProvider = "ollama" | "anthropic" | "openai";

const OLLAMA = process.env.OLLAMA_HOST ?? "http://127.0.0.1:11434";
const MAX_CHARS = 120_000;

const SYSTEM = `You are a senior reviewer of AI coding-agent configuration (CLAUDE.md, AGENTS.md, Cursor rules, skills).
Find: (1) rules that contradict each other, (2) outdated prompt workarounds written for older models (ALL-CAPS threats, "you are an expert", repeated "IMPORTANT"), (3) vague rules an agent cannot act on.
Answer as a short list. For each item: the file(s), the problem in one sentence, the fix in one sentence. If nothing is wrong, say so.`;

/** Picks a provider the user has explicitly made available: local Ollama first, then BYOK keys. */
export async function detectProvider(): Promise<AiProvider | undefined> {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(800) });
    if (r.ok) return "ollama";
  } catch {
    /* no local Ollama */
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return undefined;
}

/** The exact text that would leave the machine (secrets redacted), so the CLI can show it before asking. */
export async function buildConsultPrompt(root: string, report: ClinicalReport): Promise<string> {
  const ex = await examine(root, harnesses);
  const docs = ex.files
    .filter((f) => f.text && (f.role === "instructions" || f.role === "rules" || f.role === "skill"))
    .map((f) => `<file path="${f.rel}">\n${redactSecrets(f.text!)}\n</file>`)
    .join("\n\n");
  const known = report.diagnoses.map((d) => `- [${d.code}] ${d.summary}`).join("\n") || "- none";
  return `Static checks already found:\n${known}\n\nConfiguration files:\n${docs}`.slice(0, MAX_CHARS);
}

export interface AiAnswer {
  text: string;
  /** The model that answered; after a server-side fallback this is the fallback model. */
  model?: string;
  /** Every model in the chain declined. */
  refused: boolean;
}

/** Idle limit: a request fails when no data arrives for this long. Read per call so tests can set it. */
export const aiTimeoutMs = () => Number(process.env.CTXMEDIC_AI_TIMEOUT_MS ?? 120_000);

const timedOut = (e: unknown) => (e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError";

export async function askAi(provider: AiProvider, prompt: string, onProgress?: (chars: number) => void): Promise<AiAnswer> {
  try {
    return await ask(provider, prompt, onProgress);
  } catch (e) {
    if (timedOut(e)) throw new Error("timeout");
    throw e;
  }
}

async function ask(provider: AiProvider, prompt: string, onProgress?: (chars: number) => void): Promise<AiAnswer> {
  if (provider === "ollama") {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
      signal: AbortSignal.timeout(aiTimeoutMs()),
      body: JSON.stringify({
        model: process.env.CTXMEDIC_OLLAMA_MODEL ?? "llama3.1",
        stream: false,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) throw new Error(`Ollama: HTTP ${r.status}`);
    return { text: ((await r.json()) as { message?: { content?: string } }).message?.content ?? "", refused: false };
  }
  if (provider === "anthropic") return askAnthropic(prompt, onProgress);
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(aiTimeoutMs()),
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.CTXMEDIC_AI_MODEL ?? "gpt-5-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!r.ok) throw new Error(`OpenAI: HTTP ${r.status}`);
  const text = ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
  return { text, refused: false };
}

/** Streams the answer (long reviews stay under HTTP timeouts) and lets the API fall back to another model on a refusal. */
async function askAnthropic(prompt: string, onProgress?: (chars: number) => void): Promise<AiAnswer> {
  // shortcut: server-side fallback only on the default model (an override may not accept it), add per-model support when asked.
  const fallback = !process.env.CTXMEDIC_AI_MODEL;
  const abort = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  const idle = () => {
    clearTimeout(timer);
    timer = setTimeout(() => abort.abort(new DOMException("idle", "TimeoutError")), aiTimeoutMs());
  };
  idle();
  try {
    // Plain fetch, not the SDK: one call does not justify a dependency every `npx ctxmedic` user installs.
    const r = await fetch(`${process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      signal: abort.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
        ...(fallback ? { "anthropic-beta": "server-side-fallback-2026-07-01" } : {}),
      },
      body: JSON.stringify({
        model: process.env.CTXMEDIC_AI_MODEL ?? "claude-opus-5-5",
        max_tokens: 64000,
        stream: true,
        ...(fallback ? { fallbacks: "default" } : {}),
        system: SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok || !r.body) {
      // The API's own message says which field it rejected; without it a 400 cannot be diagnosed.
      const detail = ((await r.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message;
      throw new Error(`Anthropic: HTTP ${r.status}${detail ? ` (${detail})` : ""}`);
    }
    // One string per text block; a fallback block drops the declined attempt's partial output.
    let blocks: string[] = [];
    let model: string | undefined;
    let stop: string | undefined;
    let buf = "";
    const decoder = new TextDecoder();
    for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
      idle();
      buf += decoder.decode(chunk, { stream: true });
      let end: number;
      while ((end = buf.indexOf("\n\n")) >= 0) {
        const data = buf.slice(0, end).split("\n").find((l) => l.startsWith("data:"));
        buf = buf.slice(end + 2);
        if (!data) continue;
        const ev = JSON.parse(data.slice(5));
        if (ev.type === "message_start") model = ev.message?.model;
        else if (ev.type === "content_block_start" && ev.content_block?.type === "fallback") {
          blocks = [];
          model = ev.content_block.to?.model ?? model;
        } else if (ev.type === "content_block_start" && ev.content_block?.type === "text") blocks.push(ev.content_block.text ?? "");
        else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
          blocks[blocks.length - 1] = (blocks.at(-1) ?? "") + ev.delta.text;
          onProgress?.(blocks.reduce((n, b) => n + b.length, 0));
        } else if (ev.type === "message_delta" && ev.delta?.stop_reason) stop = ev.delta.stop_reason;
        else if (ev.type === "error") throw new Error(`Anthropic: ${ev.error?.type ?? "error"}`);
      }
    }
    if (stop === "refusal") return { text: "", model, refused: true };
    return { text: blocks.filter(Boolean).join("\n"), model, refused: false };
  } finally {
    clearTimeout(timer);
  }
}
