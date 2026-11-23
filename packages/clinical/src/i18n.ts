import type { Finding, RuleId } from "@ctxmedic/core";
import { MCP_SCHEMA_TOKENS } from "@ctxmedic/finops";
import { Lang, type Triage } from "./schema.js";

export interface CardText {
  name: string;
  prognosis: (f: Finding) => string;
  action: (f: Finding) => string;
}

/** Every user-facing string. A new language is one more `Messages` object; TypeScript enforces completeness (ADR-015). */
export interface Messages {
  cards: Record<RuleId, CardText>;
  ui: {
    triage: Record<Triage, string>;
    labs: string;
    prognosis: string;
    health: string;
    savings: string;
    perMonth: string;
    healthy: string;
    opinion: (score: number) => string;
    since: (delta: number) => string;
    manual: string;
    noLogs: string;
    spend: string;
    runRate: string;
    estimatedPrice: string;
  };
  cli: {
    noBackups: string;
    restoreHint: string;
    restored: (id: string) => string;
    noAutoFix: string;
    confirmApply: string;
    consultTitle: string;
    askPriority: string;
    priority: { economy: string; balanced: string; quality: string };
    askHarness: string;
    askBudget: string;
    enterNumber: string;
    examining: string;
    treatmentPlan: string;
    overBudget: (usd: number) => string;
    withinBudget: string;
    noAiProvider: string;
    confirmSend: (chars: number, provider: string) => string;
    nothingSent: string;
    consulting: (provider: string) => string;
    secondOpinion: string;
    goodbye: string;
    cancelled: string;
  };
}

const d = (f: Finding, k: string) => f.data[k] as any;
const n = (x: unknown) => Number(x ?? 0).toLocaleString("en");
const usd = (x: unknown) => `$${Number(x ?? 0).toFixed(2)}`;
const pct = (x: unknown) => `${Math.round(Number(x ?? 0) * 100)}%`;

const en: Messages = {
  cards: {
    ERR_BROKEN_LINK: {
      name: "Symlink Necrosis",
      prognosis: (f) =>
        d(f, "absolute")
          ? "Works on this machine only. Teammates and CI silently lose these instructions."
          : "The agent silently loses these instructions and runs without them. You will see it ignore rules you think are active.",
      action: (f) => (f.fix ? "Rewrite the link as a relative symlink." : `Restore the target or delete the dead link: ${f.files[0]}`),
    },
    WARN_CONTEXT_BLOAT: {
      name: "Context Obesity",
      prognosis: (f) =>
        `${n(d(f, "tokens"))} tokens ride along with every request. Rules in the middle get "lost in the middle", attention drifts and the bill grows with each turn.`,
      action: (f) => `Move rarely-needed sections into skills or path-scoped rules; keep the always-on core under ${n(d(f, "threshold"))} tokens.`,
    },
    WARN_DUPLICATE_RULES: {
      name: "Instruction Duplication Syndrome",
      prognosis: (f) => `${n(d(f, "wastedTokens"))} duplicated tokens. The copies drift apart and the agents get contradictory orders.`,
      action: (f) =>
        f.fix ? `Merge into ${d(f, "hub")} (hub) and symlink every tool's file to it (spokes).` : "Keep one canonical file and symlink the others to it.",
    },
    ERR_INVALID_SKILL: {
      name: "Skill Amnesia",
      prognosis: () => "The harness cannot discover or trigger this skill reliably. It costs tokens and never helps.",
      action: (f) => `Fix the SKILL.md frontmatter: ${d(f, "problem")}.`,
    },
    CRIT_SECRET_LEAK: {
      name: "Credential Hemorrhage",
      prognosis: (f) =>
        d(f, "exposed")
          ? "One `git add .` away from a public leak. Leaked keys are found by scanners within minutes."
          : "Plain-text keys in config files end up in backups, screenshots and support bundles.",
      action: () => "Rotate the key now, then reference it through an environment variable (`${VAR}`) and git-ignore the file.",
    },
    INFO_UNSUPPORTED_SYNTAX: {
      name: "Cross-Harness Allergy",
      prognosis: (f) =>
        `${d(f, "harness")} reads ${(d(f, "directives") ?? []).join(", ")} as plain text: noise at best, wrong instructions at worst.`,
      action: () => "Move tool-specific directives into that tool's own file, or keep shared files directive-free.",
    },
    FIN_BLOAT_IGNORE: {
      name: "Indexing Bloat",
      prognosis: (f) => `${d(f, "harness")} indexes build output and lockfiles. Search results fill with junk and retrieval burns tokens.`,
      action: (f) => `Create ${d(f, "ignoreFile")} with the standard exclusions.`,
    },
    FIN_UNUSED_MCP: {
      name: "Toxic MCP Syndrome",
      prognosis: (f) =>
        `${n(d(f, "schemaTokens"))} tokens of tool schemas (${d(f, "estimated") === false ? "measured from session logs" : `estimated at ${n(MCP_SCHEMA_TOKENS)} per server`}) in every request for a server nobody calls.`,
      action: (f) =>
        d(f, "scope") === "global"
          ? `Move "${d(f, "server")}" from the global config into the project-level MCP config of the projects that need it.`
          : `Remove "${d(f, "server")}" from ${f.files[0]} or disable it until needed.`,
    },
    FIN_MODEL_OVERKILL: {
      name: "Model Overkill",
      prognosis: (f) => `${d(f, "sessions")} trivial sessions paid frontier prices (${usd(d(f, "costUsd"))} in ${d(f, "days")} days).`,
      action: (f) => `Route one-shot tasks, routine skills and subagents to ${d(f, "suggested")} (set \`model:\` in the skill/agent frontmatter).`,
    },
    FIN_CONTEXT_SNOWBALL: {
      name: "Context Snowball",
      prognosis: (f) =>
        `Worst case: ${d(f, "worstSteps")} steps, peak context ${n(d(f, "worstMaxContext"))} tokens. Each step re-reads the whole history; quality drops as it grows.`,
      action: () => "Run /compact at task milestones and /clear between unrelated tasks; enable auto-compact.",
    },
    FIN_CACHE_MISS: {
      name: "Prompt Cache Thrashing",
      prognosis: (f) => `Cache hit ratio ${pct(d(f, "cacheHitRatio"))}: you pay full price for context the provider could serve at ~10%.`,
      action: () => "Keep instructions static: no dates, branch names or random IDs at the top; avoid switching models mid-session.",
    },
  },
  ui: {
    triage: { resuscitation: "🔴 Resuscitation", therapy: "🟡 Therapy", preventive: "🟢 Preventive" },
    labs: "Vitals",
    prognosis: "Prognosis",
    health: "Health Score",
    savings: "Potential savings",
    perMonth: "/mo",
    healthy: "No complaints. The patient is healthy.",
    opinion: (s) =>
      s >= 90
        ? "Excellent condition. Only preventive care needed."
        : s >= 70
          ? "Stable, but a few conditions need therapy."
          : s >= 40
            ? "The patient needs treatment soon."
            : "Critical condition. Start with the red cards right now.",
    since: (x) => (x === 0 ? "unchanged since the last visit" : x > 0 ? `+${x} since the last visit` : `${x} since the last visit`),
    manual: "manual treatment",
    noLogs: "No session logs found: FinOps analysis skipped.",
    spend: "Spend",
    runRate: "run rate",
    estimatedPrice: "≈ model not in the price table: estimated at Sonnet-class rates",
  },
  cli: {
    noBackups: "No backups in .ctxmedic/backups: nothing to restore.",
    restoreHint: "Undo a fix: ctxmedic restore <backup> (or latest)",
    restored: (id) => `Restored backup ${id}`,
    noAutoFix: "No auto-fix: follow the prescription by hand.",
    confirmApply: "Apply? (originals are backed up to .ctxmedic/backups)",
    consultTitle: "🩺 ctxmedic consultation",
    askPriority: "What matters most to you?",
    priority: { economy: "Saving tokens and money", balanced: "Balanced", quality: "Maximum answer quality" },
    askHarness: "Your main AI tool?",
    askBudget: "Monthly AI budget in $ (empty = no limit)",
    enterNumber: "Enter a number",
    examining: "Examining the patient",
    treatmentPlan: "Treatment plan",
    overBudget: (x) => `Over budget by $${x.toFixed(2)}/mo`,
    withinBudget: "Within budget",
    noAiProvider: "No Ollama, ANTHROPIC_API_KEY or OPENAI_API_KEY: AI review skipped.",
    confirmSend: (chars, provider) => `Send ${chars.toLocaleString("en")} characters of your instructions (secrets redacted) to ${provider}?`,
    nothingSent: "Nothing was sent.",
    consulting: (provider) => `Consulting ${provider}`,
    secondOpinion: "Second opinion",
    goodbye: "Get well soon! Follow-up: ctxmedic checkup",
    cancelled: "Cancelled",
  },
};

const catalogs: Record<Lang, Messages> = { en };

export type UiText = Messages["ui"];
export const messages = (lang: Lang): Messages => catalogs[lang];
export const cards = (lang: Lang) => catalogs[lang].cards;
export const t = (lang: Lang): UiText => catalogs[lang].ui;
/** Unknown or not-yet-supported codes fall back to English. */
export const resolveLang = (x?: string): Lang => {
  const r = Lang.safeParse((x ?? process.env.CTXMEDIC_LANG ?? "en").slice(0, 2).toLowerCase());
  return r.success ? r.data : "en";
};
