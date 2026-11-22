// Turns `ctxmedic checkup --json` into a job summary and file annotations, then sets the exit code.
// Used by ../action.yml. Report text (diagnoses, opinion) comes localized from the CLI.
// shortcut: the few table labels below are English inline, move them to the CLI catalog when a second language lands.
import fs from "node:fs";
import path from "node:path";

const [file] = process.argv.slice(2);
const failOn = process.env.CTXMEDIC_FAIL_ON || "critical";
const root = process.env.CTXMEDIC_PATH || ".";
if (!["critical", "warning"].includes(failOn)) {
  console.log(`::error::fail-on must be "critical" or "warning", got "${failOn}"`);
  process.exit(2);
}

const r = JSON.parse(fs.readFileSync(file, "utf8"));
const ICON = { resuscitation: "🔴", therapy: "🟡", preventive: "🟢" };
const LEVEL = { resuscitation: "error", therapy: "warning", preventive: "notice" };
const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const prop = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A").replace(/:/g, "%3A").replace(/,/g, "%2C");
const msg = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");

const { resuscitation, therapy, preventive } = r.counts;
const lines = [
  `## 🩺 ctxmedic ${r.version} · Health Score ${r.healthScore}/100`,
  "",
  `_${r.opinion}_`,
  "",
  `🔴 ${resuscitation} · 🟡 ${therapy} · 🟢 ${preventive}`,
  "",
];
if (r.diagnoses.length) {
  lines.push("| | Rx | Diagnosis | Finding | Files | Treatment |", "|---|---|---|---|---|---|");
  for (const d of r.diagnoses)
    lines.push(`| ${ICON[d.triage]} | ${d.rx.id} | ${cell(d.diagnosis)} | ${cell(d.finding.message)} | ${cell(d.files.join(", "))} | ${cell(d.rx.command ? `\`${d.rx.command}\`` : d.rx.action)} |`);
}
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
console.log(lines.join("\n"));

for (const d of r.diagnoses) {
  const text = msg(`${d.rx.id} ${d.diagnosis}: ${d.finding.message}. ${d.rx.action}`);
  const files = d.files.length ? d.files : [null];
  for (const f of files) {
    const loc = f ? ` file=${prop(path.join(root, f))},title=${prop(d.code)}` : ` title=${prop(d.code)}`;
    console.log(`::${LEVEL[d.triage]}${loc}::${text}`);
  }
}

const failed = resuscitation > 0 || (failOn === "warning" && therapy > 0);
process.exit(failed ? 1 : 0);
