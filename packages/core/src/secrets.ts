export interface SecretHit {
  kind: string;
  masked: string;
  line: number;
}

const PATTERNS: [string, RegExp][] = [
  ["Anthropic API key", /\bsk-ant-[A-Za-z0-9_-]{20,}/g],
  ["OpenAI API key", /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/g],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["Stripe key", /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}/g],
];
// Generic KEY/TOKEN/SECRET assignments (JSON, TOML, env) with a long opaque value.
// The key must END with the keyword, so names like "firstTokenDate" do not match.
// The lookbehind starts a match only at a name's first char: without it a long run of "-" is quadratic (ReDoS).
const GENERIC = /(?<![A-Za-z0-9_-])["']?([A-Za-z0-9_-]*(?:api[_-]?key|token|secret|password|passwd))["']?\s*[:=]\s*["']([^"'\s$]{16,})["']/gi;

export const mask = (s: string) => (s.length <= 8 ? "****" : `${s.slice(0, 6)}…${s.slice(-2)} (${s.length} chars)`);

function entropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) h -= (n / s.length) * Math.log2(n / s.length);
  return h;
}

export function findSecrets(text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  const lineOf = (i: number) => text.slice(0, i).split("\n").length;
  for (const [kind, re] of PATTERNS)
    for (const m of text.matchAll(re))
      if (!seen.has(m[0])) seen.add(m[0]), hits.push({ kind, masked: mask(m[0]), line: lineOf(m.index!) });
  for (const m of text.matchAll(GENERIC)) {
    const v = m[2]!;
    if (seen.has(v) || [...seen].some((s) => s.includes(v) || v.includes(s)) || entropy(v) < 3.5) continue;
    seen.add(v);
    hits.push({ kind: `${m[1]} value`, masked: mask(v), line: lineOf(m.index!) });
  }
  return hits;
}

/** Replaces every detected secret with a mask; used before any text leaves the machine (consult --ai). */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [, re] of PATTERNS) out = out.replace(re, (s) => `[REDACTED ${mask(s)}]`);
  return out.replace(GENERIC, (all, _k, v: string) => (entropy(v) < 3.5 ? all : all.replace(v, "[REDACTED]")));
}
