import { applyFix, configHash, examine, FixRefusedError, loadConfig, loadPlugins, type Finding, type Rule, type FinOpsReport, type FixOptions, type FixResult } from "@ctxmedic/core";
import { analyze } from "@ctxmedic/finops";
import { harnesses } from "@ctxmedic/harnesses";
import { cards, messages, t, type CardText } from "./i18n.js";
import { Anamnesis, ClinicalReport, type ClinicalDiagnosis, type Lang, type ScanSettings, type Triage } from "./schema.js";
import { healthGain, healthScore } from "./score.js";
import { loadAnamnesis, loadHistory, recordVisit } from "./store.js";

// Replaced by tsup `define` from packages/cli/package.json; undefined when run from source (vitest).
declare const __CTXMEDIC_VERSION__: string | undefined;
export const VERSION = typeof __CTXMEDIC_VERSION__ === "string" ? __CTXMEDIC_VERSION__ : "0.0.0-dev";

const TRIAGE: Record<Finding["severity"], Triage> = { critical: "resuscitation", warning: "therapy", info: "preventive" };
const ORDER: Triage[] = ["resuscitation", "therapy", "preventive"];

const human = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
function vitals(f: Finding): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  // The first file carries the line when the finding points at one (`file:line`, like compilers print it).
  const shown = f.files.slice(0, 3).map((p, i) => (i === 0 && f.line ? `${p}:${f.line}` : p));
  if (f.files.length) out.push({ label: "Files", value: shown.join(", ") + (f.files.length > 3 ? ` +${f.files.length - 3}` : "") });
  for (const [k, v] of Object.entries(f.data)) {
    if (typeof v === "number")
      out.push({
        label: human(k),
        value: /ratio|similarity|share/i.test(k) ? `${Math.round(v * 100)}%` : /usd/i.test(k) ? `$${v.toFixed(2)}` : v.toLocaleString("en"),
      });
    else if (typeof v === "string" || typeof v === "boolean") out.push({ label: human(k), value: String(v) });
    else if (k === "hits" && Array.isArray(v))
      out.push({ label: "Secrets", value: v.map((h: { kind: string; masked: string; line: number }) => `${h.kind} ${h.masked} (line ${h.line})`).join("; ") });
  }
  if (f.monthlySavingsUsd) out.push({ label: "Savings", value: `$${f.monthlySavingsUsd.toFixed(2)}/mo` });
  return out;
}

export function diagnose(findings: Finding[], lang: Lang, anamnesis: Anamnesis = Anamnesis.parse({}), extraRules: Rule[] = []): ClinicalDiagnosis[] {
  const cat: Record<string, CardText> = cards(lang);
  // Built-in card, else the rule's own, else one built from its meta (ADR-026).
  const cardFor = (f: Finding): CardText => {
    if (cat[f.ruleId]) return cat[f.ruleId]!;
    const meta = extraRules.find((r) => r.id === f.ruleId)?.meta;
    if (meta?.card) return meta.card;
    const ext = messages(lang).externalCard;
    return { name: f.ruleId, prognosis: () => ext.prognosis(meta?.description ?? f.message), action: () => ext.action(meta?.docs) };
  };
  const weight = (f: Finding) => {
    const gain = healthGain(findings, f);
    const usd = f.monthlySavingsUsd ?? 0;
    return anamnesis.priority === "economy" ? usd * 10 + gain : anamnesis.priority === "quality" ? gain * 10 + usd : gain + usd / 5;
  };
  const sorted = [...findings].sort(
    (a, b) =>
      ORDER.indexOf(TRIAGE[a.severity]) - ORDER.indexOf(TRIAGE[b.severity]) || weight(b) - weight(a) || a.message.localeCompare(b.message),
  );
  return sorted.map((f, i) => {
    const id = `RX-${String(i + 1).padStart(2, "0")}`;
    const card = cardFor(f);
    return {
      code: f.ruleId,
      triage: TRIAGE[f.severity],
      diagnosis: card.name,
      summary: f.message,
      vitals: vitals(f),
      prognosis: card.prognosis(f),
      rx: {
        id,
        action: card.action(f),
        command: f.fix ? `ctxmedic treat ${id}` : undefined,
        autoFix: Boolean(f.fix),
        healthGain: healthGain(findings, f),
        monthlySavingsUsd: f.monthlySavingsUsd,
      },
      files: f.files,
      finding: f,
    };
  });
}

export interface CheckupOptions {
  root: string;
  lang: Lang;
  /** Analyze session logs (FinOps). Default true. */
  finops?: boolean;
  days?: number;
  global?: boolean;
  /** Save this visit to history. Default true. */
  record?: boolean;
  /** Rules from outside ctxmedic (namespaced ids, ADR-026). */
  extraRules?: Rule[];
  /** Load the plugins listed in the config; their code runs with ctxmedic's rights (ADR-027). Default false. */
  plugins?: boolean;
}

/** The flags of a checkup that change its score, with the same defaults `checkup` uses. */
export const scanSettings = (opts: Pick<CheckupOptions, "global" | "finops" | "days"> & { config?: string }): ScanSettings => ({
  global: opts.global !== false,
  finops: opts.finops !== false,
  days: opts.days ?? 30,
  config: opts.config ?? "",
});

export async function checkup(opts: CheckupOptions): Promise<ClinicalReport> {
  const listed = loadConfig(opts.root).plugins;
  const loaded = opts.plugins ? await loadPlugins(opts.root, listed) : [];
  const extraRules = [...(opts.extraRules ?? []), ...loaded.flatMap((p) => p.rules)];
  const plugins = listed.map((name) => {
    const p = loaded.find((x) => x.name === name);
    return { name, version: p?.version, loaded: Boolean(p), rules: p?.rules.map((r) => r.id) ?? [] };
  });
  const ex = await examine(opts.root, harnesses, { global: opts.global, extraRules });
  let finops: FinOpsReport | null = null;
  if (opts.finops !== false) finops = await analyze({ root: ex.vitals.root, files: ex.files, days: opts.days ?? 30, config: ex.config });
  const findings = [...ex.findings, ...(finops?.findings ?? [])];
  const diagnoses = diagnose(findings, opts.lang, loadAnamnesis(), extraRules);
  const score = healthScore(findings);
  const counts = { resuscitation: 0, therapy: 0, preventive: 0 };
  for (const d of diagnoses) counts[d.triage]++;
  const savings = findings.reduce((n, f) => n + (f.monthlySavingsUsd ?? 0), 0);
  const scan = scanSettings({ ...opts, config: configHash(ex.config) });
  const previous = loadHistory(ex.vitals.root, scan).at(-1) ?? null;
  const report = ClinicalReport.parse({
    tool: "ctxmedic",
    version: VERSION,
    lang: opts.lang,
    generatedAt: new Date().toISOString(),
    patient: ex.vitals,
    healthScore: score,
    previous,
    opinion: diagnoses.length ? t(opts.lang).opinion(score) : t(opts.lang).healthy,
    counts,
    diagnoses,
    finops,
    potentialMonthlySavingsUsd: Math.round(savings * 100) / 100,
    plugins,
  });
  if (opts.record !== false)
    recordVisit({
      at: report.generatedAt,
      root: ex.vitals.root,
      scan,
      healthScore: score,
      counts,
      monthlySpendUsd: finops?.monthlyRunRateUsd,
      potentialMonthlySavingsUsd: report.potentialMonthlySavingsUsd,
    });
  return report;
}

export interface TreatResult {
  diagnosis: ClinicalDiagnosis;
  result?: FixResult;
  /** Set when the diagnosis has no auto-fix: the manual instruction to show. */
  manual?: string;
}

/** Re-examines the patient (RX ids are deterministic for the same state) and applies one prescription. */
export async function treat(rxId: string, opts: CheckupOptions & Omit<FixOptions, "root">): Promise<TreatResult> {
  const report = await checkup({ ...opts, record: false });
  const dx = report.diagnoses.find((d) => d.rx.id === rxId.toUpperCase());
  if (!dx) throw new FixRefusedError(`${rxId} not found; run \`ctxmedic checkup\` to see current prescriptions`);
  if (!dx.finding.fix) return { diagnosis: dx, manual: dx.rx.action };
  const result = await applyFix(dx.finding.fix, { root: opts.root, dryRun: opts.dryRun, force: opts.force, global: opts.global });
  return { diagnosis: dx, result };
}
