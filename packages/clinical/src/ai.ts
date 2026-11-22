import Anthropic from "@anthropic-ai/sdk";
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

export async function askAi(provider: AiProvider, prompt: string): Promise<string> {
  if (provider === "ollama") {
    const r = await fetch(`${OLLAMA}/api/chat`, {
      method: "POST",
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
    return ((await r.json()) as { message?: { content?: string } }).message?.content ?? "";
  }
  if (provider === "anthropic") {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: process.env.CTXMEDIC_AI_MODEL ?? "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: prompt }],
    });
    if (res.stop_reason === "refusal") return "The model declined to review this configuration.";
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
  }
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
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
  return ((await r.json()) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? "";
}
