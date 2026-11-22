/** USD per million tokens. Cache write is the 5-minute rate; 1-hour writes cost 2× input (Anthropic). */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const PRICING_AS_OF = "2026-11-03";

const a = (input: number, output: number, cacheRead = input / 10): Price => ({ input, output, cacheRead, cacheWrite: input * 1.25 });
const o = (input: number, output: number, cacheRead = input / 10): Price => ({ input, output, cacheRead, cacheWrite: input });

// First match wins: keep specific keys before generic ones.
const TABLE: [string, Price][] = [
  ["fable-5-2", a(8, 40, 0.2)],
  ["mythos-5-2", a(8, 40, 0.2)],
  ["fable", a(10, 50)],
  ["mythos", a(10, 50)],
  ["opus-5-5", a(4, 20, 0.2)],
  ["opus-4-1", a(15, 75)],
  ["opus-4-0", a(15, 75)],
  ["opus-4-2025", a(15, 75)],
  ["opus", a(5, 25)],
  ["sonnet-5-5", a(2, 10, 0.1)],
  ["sonnet-5", a(2, 10)],
  ["sonnet", a(3, 15)],
  ["haiku-5-5", a(0.1, 0.5, 0.01)],
  ["haiku-4", a(1, 5)],
  ["haiku", a(0.8, 4)],
  ["gpt-5-nano", o(0.05, 0.4)],
  ["gpt-5-mini", o(0.25, 2)],
  ["gpt-5", o(1.25, 10)],
  ["o4-mini", o(1.1, 4.4, 0.275)],
  ["o3", o(2, 8, 0.5)],
  ["gpt-4.1-mini", o(0.4, 1.6)],
  ["gpt-4.1", o(2, 8, 0.5)],
  ["gpt-4o-mini", o(0.15, 0.6)],
  ["gpt-4o", o(2.5, 10)],
];
const FALLBACK = a(3, 15);

export function priceOf(model: string): { price: Price; estimated: boolean } {
  const m = model.toLowerCase();
  const hit = TABLE.find(([k]) => m.includes(k));
  return hit ? { price: hit[1], estimated: false } : { price: FALLBACK, estimated: true };
}

/** Frontier / reasoning models, and the lighter model we suggest instead. */
export function lighterModel(model: string): string | undefined {
  const m = model.toLowerCase();
  if (/fable|mythos|opus/.test(m)) return "claude-sonnet-5-5";
  if (/^o3|gpt-5(\.\d+)?-pro|gpt-5(\.\d+)?$|gpt-5(\.\d+)?-codex$/.test(m)) return "gpt-5-mini";
  return undefined;
}

export interface TokenUse {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cacheWrite1h?: number;
}

export function costOf(model: string, u: TokenUse): number {
  const { price: p } = priceOf(model);
  const w1h = u.cacheWrite1h ?? 0;
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + (u.cacheWrite - w1h) * p.cacheWrite + w1h * p.input * 2) / 1e6;
}
