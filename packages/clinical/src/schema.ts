import { z } from "zod";
import { Finding, FinOpsReport, PatientVitals, RuleId } from "@ctxmedic/core";

// Supported interface languages. To add one: add its code here and a `Messages` catalog in i18n.ts (ADR-015).
export const Lang = z.enum(["en"]);
export type Lang = z.infer<typeof Lang>;

export const Triage = z.enum(["resuscitation", "therapy", "preventive"]);
export type Triage = z.infer<typeof Triage>;

export const PrescriptionRx = z.object({
  id: z.string().regex(/^RX-\d{2,}$/),
  action: z.string(),
  command: z.string().optional(),
  autoFix: z.boolean(),
  healthGain: z.number().nonnegative(),
  monthlySavingsUsd: z.number().nonnegative().optional(),
});
export type PrescriptionRx = z.infer<typeof PrescriptionRx>;

export const ClinicalDiagnosis = z.object({
  code: RuleId,
  triage: Triage,
  diagnosis: z.string(),
  summary: z.string(),
  vitals: z.array(z.object({ label: z.string(), value: z.string() })),
  prognosis: z.string(),
  rx: PrescriptionRx,
  files: z.array(z.string()),
  finding: Finding,
});
export type ClinicalDiagnosis = z.infer<typeof ClinicalDiagnosis>;

const Counts = z.object({ resuscitation: z.number(), therapy: z.number(), preventive: z.number() });

export const Anamnesis = z.object({
  priority: z.enum(["economy", "balanced", "quality"]).default("balanced"),
  primaryHarness: z.string().optional(),
  monthlyBudgetUsd: z.number().nonnegative().optional(),
});
export type Anamnesis = z.infer<typeof Anamnesis>;

/** Scan flags that change the score; visits are compared only when these match (ADR-017). */
export const ScanSettings = z.object({
  global: z.boolean(),
  finops: z.boolean(),
  days: z.number(),
  /** `configHash` of ctxmedic.config.json; "" without one, and in history written before v0.3. */
  config: z.string().default(""),
});
export type ScanSettings = z.infer<typeof ScanSettings>;
export const DEFAULT_SCAN: ScanSettings = { global: true, finops: true, days: 30, config: "" };

export const Visit = z.object({
  at: z.string(),
  root: z.string(),
  /** Missing in history written by v0.1.0: those runs are assumed to use the defaults. */
  scan: ScanSettings.default(DEFAULT_SCAN),
  healthScore: z.number(),
  counts: Counts,
  monthlySpendUsd: z.number().optional(),
  potentialMonthlySavingsUsd: z.number(),
});
export type Visit = z.infer<typeof Visit>;

export const ClinicalReport = z.object({
  tool: z.literal("ctxmedic"),
  version: z.string(),
  lang: Lang,
  generatedAt: z.string(),
  patient: PatientVitals,
  healthScore: z.number().min(0).max(100),
  previous: Visit.nullable(),
  opinion: z.string(),
  counts: Counts,
  diagnoses: z.array(ClinicalDiagnosis),
  finops: FinOpsReport.nullable(),
  potentialMonthlySavingsUsd: z.number(),
});
export type ClinicalReport = z.infer<typeof ClinicalReport>;
