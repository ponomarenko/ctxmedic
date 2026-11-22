import { getEncoding, type Tiktoken } from "js-tiktoken";

let enc: Tiktoken | undefined;
// shortcut: cl100k_base approximates every vendor's tokenizer (±15%, ADR-004); swap per-harness if billing-grade counts are needed.
export function countTokens(text: string): number {
  if (!text) return 0;
  enc ??= getEncoding("cl100k_base");
  return enc.encode(text, [], []).length;
}
