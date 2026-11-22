import pc from "picocolors";
import { t, type ClinicalDiagnosis, type ClinicalReport, type Lang, type Visit } from "@ctxmedic/clinical";
import type { FinOpsReport } from "@ctxmedic/core";

const COLOR = { resuscitation: pc.red, therapy: pc.yellow, preventive: pc.green } as const;
const usd = (n: number) => `$${n.toFixed(2)}`;

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > width) lines.push(line.trim()), (line = "");
    line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines.join("\n" + indent);
}

function bar(score: number): string {
  const full = Math.round(score / 5);
  const color = score >= 90 ? pc.green : score >= 70 ? pc.yellow : pc.red;
  return color("█".repeat(full)) + pc.dim("░".repeat(20 - full));
}

export function card(d: ClinicalDiagnosis, lang: Lang): string {
  const tx = t(lang);
  const c = COLOR[d.triage];
  const side = c("│");
  const w = Math.min(process.stdout.columns ?? 100, 110) - 16;
  const label = (s: string) => pc.dim(s.padEnd(11));
  const out = [
    c("╭─ ") + c(pc.bold(`${tx.triage[d.triage]} · ${d.rx.id}`)) + "  " + pc.bold(d.diagnosis) + pc.dim(` [${d.code}]`),
    `${side} ${wrap(d.summary, w + 11, `${side} `)}`,
  ];
  d.vitals.forEach((v, i) => out.push(`${side} ${label(i === 0 ? tx.labs.split(" ")[0]! : "")}${pc.cyan(v.label)}: ${wrap(v.value, w - v.label.length, `${side} ${" ".repeat(11)}`)}`));
  out.push(`${side} ${label(tx.prognosis)}${wrap(d.prognosis, w, `${side} ${" ".repeat(11)}`)}`);
  const gains = [d.rx.healthGain ? pc.green(`+${d.rx.healthGain} health`) : "", d.rx.monthlySavingsUsd ? pc.green(`${usd(d.rx.monthlySavingsUsd)}${tx.perMonth}`) : ""].filter(Boolean).join(", ");
  out.push(`${side} ${label("Rx")}${wrap(d.rx.action, w, `${side} ${" ".repeat(11)}`)}${gains ? `  ${pc.dim("(")}${gains}${pc.dim(")")}` : ""}`);
  out.push(`${side} ${" ".repeat(11)}${d.rx.command ? pc.bold(pc.magenta(`→ ${d.rx.command}`)) : pc.dim(tx.manual)}`);
  out.push(c("╰─"));
  return out.join("\n");
}

export function finopsSummary(f: FinOpsReport, lang: Lang): string {
  const tx = t(lang);
  if (!f.sessions) return pc.dim(lang === "uk" ? "Логів сесій не знайдено: FinOps-аналіз пропущено." : "No session logs found: FinOps analysis skipped.");
  const top = f.byModel.slice(0, 4).map((m) => `${m.model} ${usd(m.costUsd)}`).join(pc.dim(" · "));
  return [
    `${pc.bold("FinOps")} ${pc.dim(`(${f.periodDays}d, ${f.sessions} sessions, ${f.steps.toLocaleString("en")} requests, prices as of ${f.pricingAsOf})`)}`,
    `  ${lang === "uk" ? "Витрати" : "Spend"}: ${pc.bold(usd(f.costUsd))}  ·  ${lang === "uk" ? "темп" : "run rate"} ${usd(f.monthlyRunRateUsd)}${tx.perMonth}  ·  cache hit ${f.cacheHitRatio === null ? "n/a" : `${Math.round(f.cacheHitRatio * 100)}%`}`,
    top ? `  ${top}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function header(r: ClinicalReport): string {
  const tx = t(r.lang);
  const delta = r.previous ? r.healthScore - r.previous.healthScore : null;
  const trend = delta === null ? "" : pc.dim(`  (${tx.since(delta)})`);
  return [
    "",
    pc.bold(`🩺 ctxmedic ${r.version}`) + pc.dim(` · ${r.patient.root}`),
    pc.dim(`   ${r.patient.filesScanned} files · ${r.patient.harnesses.join(", ") || "no AI harness detected"}`),
    "",
    `   ${tx.health}: ${bar(r.healthScore)} ${pc.bold(String(r.healthScore))}/100${trend}`,
    `   ${pc.italic(r.opinion)}`,
    `   ${tx.triage.resuscitation} ${r.counts.resuscitation}   ${tx.triage.therapy} ${r.counts.therapy}   ${tx.triage.preventive} ${r.counts.preventive}` +
      (r.potentialMonthlySavingsUsd ? `   ·   ${tx.savings}: ${pc.green(pc.bold(usd(r.potentialMonthlySavingsUsd) + tx.perMonth))}` : ""),
    "",
  ].join("\n");
}

export function report(r: ClinicalReport): string {
  return [header(r), ...r.diagnoses.map((d) => card(d, r.lang) + "\n"), r.finops ? finopsSummary(r.finops, r.lang) : ""].join("\n");
}

export function history(visits: Visit[]): string {
  if (!visits.length) return pc.dim("No visits yet. Run `ctxmedic checkup`.");
  return visits
    .slice(-20)
    .map((v) => `${v.at.slice(0, 16).replace("T", " ")}  ${bar(v.healthScore)} ${String(v.healthScore).padStart(3)}  🔴${v.counts.resuscitation} 🟡${v.counts.therapy} 🟢${v.counts.preventive}  ${pc.dim(v.root)}`)
    .join("\n");
}
