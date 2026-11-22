import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as p from "@clack/prompts";
import { Command } from "commander";
import pc from "picocolors";
import {
  askAi,
  buildConsultPrompt,
  checkup,
  detectProvider,
  loadAnamnesis,
  loadHistory,
  messages,
  resolveLang,
  saveAnamnesis,
  t,
  VERSION,
  type Anamnesis,
  type Lang,
} from "@ctxmedic/clinical";
import { applyFix, examine, FixRefusedError, listBackups, restoreBackup, type FixPlan } from "@ctxmedic/core";
import { analyze } from "@ctxmedic/finops";
import { harnesses } from "@ctxmedic/harnesses";
import { startServer } from "@ctxmedic/server";
import * as render from "./render.js";

interface Common {
  lang?: string;
  days: string;
  finops: boolean;
  global: boolean;
  json?: boolean;
}

const common = (cmd: Command) =>
  cmd
    .option("--lang <lang>", "interface language (only en for now)")
    .option("--days <n>", "how many days of session logs to analyze", "30")
    .option("--no-finops", "skip session-log (cost) analysis")
    .option("--no-global", "skip global configs in the home directory");

const ctx = (dir: string | undefined, o: Common) => ({
  root: path.resolve(dir ?? "."),
  lang: resolveLang(o.lang) as Lang,
  days: Math.max(1, Number.parseInt(o.days, 10) || 30),
  finops: o.finops,
  global: o.global,
});

function fail(e: unknown): never {
  console.error(pc.red(`✖ ${e instanceof FixRefusedError ? e.message : (e as Error).stack ?? e}`));
  process.exit(2);
}

const program = new Command()
  .name("ctxmedic")
  .description("The context medic for your AI coding setup: checkup, treat, savings.")
  .version(VERSION);

common(program.command("checkup [path]").description("examine AI configs and session logs, print clinical cards"))
  .option("--json", "print the full report as JSON")
  .action(async (dir: string | undefined, o: Common) => {
    const r = await checkup(ctx(dir, o)).catch(fail);
    console.log(o.json ? JSON.stringify(r, null, 2) : render.report(r));
    // Non-zero exit on critical findings so CI can gate on it.
    if (r.counts.resuscitation > 0) process.exitCode = 1;
  });

common(program.command("treat [rx]").description("apply a prescription (e.g. RX-01), or --all auto-fixes"))
  .option("--all", "apply every auto-fixable prescription")
  .option("--dry-run", "show what would change without writing")
  .option("--force", "allow changes to files with uncommitted git edits")
  .option("-y, --yes", "do not ask for confirmation")
  .action(async (rx: string | undefined, o: Common & { all?: boolean; dryRun?: boolean; force?: boolean; yes?: boolean }) => {
    const c = ctx(undefined, o);
    if (!rx && !o.all) fail(new FixRefusedError("name a prescription (ctxmedic treat RX-01) or pass --all"));
    const report = await checkup({ ...c, record: false }).catch(fail);
    const picked = o.all ? report.diagnoses.filter((d) => d.rx.autoFix) : report.diagnoses.filter((d) => d.rx.id === rx!.toUpperCase());
    if (!picked.length) fail(new FixRefusedError(o.all ? "nothing to auto-fix" : `${rx} not found; run \`ctxmedic checkup\``));
    for (const d of picked) console.log(render.card(d, c.lang) + "\n");
    const manual = picked.filter((d) => !d.rx.autoFix);
    const m = messages(c.lang).cli;
    if (manual.length === picked.length) return console.log(pc.yellow(m.noAutoFix));
    const plans = picked.flatMap((d) => (d.finding.fix ? [d.finding.fix as FixPlan] : []));
    for (const plan of plans) for (const op of plan.ops) console.log(pc.dim(`  ${op.kind === "write" ? "write  " : "symlink"} ${path.relative(c.root, op.path)}${op.kind === "symlink" ? ` → ${op.target}` : ""}`));
    if (!o.dryRun && !o.yes) {
      const ok = await p.confirm({ message: m.confirmApply });
      if (p.isCancel(ok) || !ok) return p.cancel(m.cancelled);
    }
    for (const plan of plans) {
      const res = await applyFix(plan, { root: c.root, dryRun: o.dryRun, force: o.force, global: false }).catch(fail);
      console.log(`${o.dryRun ? pc.yellow("dry-run") : pc.green("✔")} ${plan.title}${res.dryRun ? "" : pc.dim(`  backup: ${path.relative(c.root, res.backupDir)}`)}`);
    }
  });

program
  .command("restore [backup]")
  .description("undo a fix: list backups, or restore one by id (or latest)")
  .option("--lang <lang>", "interface language (only en for now)")
  .option("--dry-run", "show what would change without writing")
  .option("--force", "restore even if files changed after the fix")
  .action(async (id: string | undefined, o: { lang?: string; dryRun?: boolean; force?: boolean }) => {
    const root = path.resolve(".");
    const m = messages(resolveLang(o.lang) as Lang).cli;
    if (!id) {
      const all = await listBackups(root);
      if (!all.length) return console.log(m.noBackups);
      for (const b of all) console.log(`${pc.cyan(b.id)}  ${b.title}`);
      return console.log(pc.dim(`\n${m.restoreHint}`));
    }
    const r = await restoreBackup(id, { root, dryRun: o.dryRun, force: o.force }).catch(fail);
    for (const line of r.restored) console.log(pc.dim(`  ${line}`));
    console.log(`${r.dryRun ? pc.yellow("dry-run") : pc.green("✔")} ${m.restored(r.id)}: ${r.title}`);
  });

common(program.command("savings [path]").description("FinOps: token spend, cache hit ratio and savings prescriptions"))
  .option("--json", "print the FinOps report as JSON")
  .action(async (dir: string | undefined, o: Common) => {
    const c = ctx(dir, o);
    const ex = await examine(c.root, harnesses, { global: c.global });
    const f = await analyze({ root: c.root, files: ex.files, days: c.days }).catch(fail);
    if (o.json) return console.log(JSON.stringify(f, null, 2));
    console.log("\n" + render.finopsSummary(f, c.lang) + "\n");
    const r = await checkup({ ...c, record: false });
    for (const d of r.diagnoses.filter((d) => d.code.startsWith("FIN_"))) console.log(render.card(d, c.lang) + "\n");
    console.log(pc.bold(`Total: ${pc.green(`$${f.potentialMonthlySavingsUsd.toFixed(2)}/mo`)}`));
  });

common(program.command("consult [path]").description("interactive appointment: anamnesis, personal treatment plan, optional AI review"))
  .option("--ai", "ask an LLM (local Ollama, or your Anthropic/OpenAI key) to look for contradictions")
  .action(async (dir: string | undefined, o: Common & { ai?: boolean }) => {
    const c = ctx(dir, o);
    const m = messages(c.lang).cli;
    p.intro(pc.bold(m.consultTitle));
    const prev = loadAnamnesis();
    const priority = await p.select({
      message: m.askPriority,
      initialValue: prev.priority,
      options: (["economy", "balanced", "quality"] as const).map((value) => ({ value, label: m.priority[value] })),
    });
    if (p.isCancel(priority)) return p.cancel(m.cancelled);
    const primaryHarness = await p.select({
      message: m.askHarness,
      initialValue: prev.primaryHarness ?? "claude-code",
      options: harnesses.map((h) => ({ value: h.id, label: h.name })),
    });
    if (p.isCancel(primaryHarness)) return p.cancel(m.cancelled);
    const budget = await p.text({
      message: m.askBudget,
      initialValue: prev.monthlyBudgetUsd?.toString() ?? "",
      validate: (v) => (v && !(Number(v) >= 0) ? m.enterNumber : undefined),
    });
    if (p.isCancel(budget)) return p.cancel(m.cancelled);
    const a: Anamnesis = { priority, primaryHarness, monthlyBudgetUsd: budget ? Number(budget) : undefined };
    saveAnamnesis(a);

    const s = p.spinner();
    s.start(m.examining);
    const r = await checkup(c).catch(fail);
    s.stop(`${t(c.lang).health}: ${r.healthScore}/100`);
    const course = r.diagnoses.filter((d) => !a.primaryHarness || !d.finding.data.harness || d.finding.data.harness === a.primaryHarness || d.triage === "resuscitation").slice(0, 5);
    p.note(course.map((d, i) => `${i + 1}. ${d.rx.id} ${d.diagnosis}: ${d.rx.action}${d.rx.command ? `\n   → ${d.rx.command}` : ""}`).join("\n") || r.opinion, m.treatmentPlan);
    if (a.monthlyBudgetUsd !== undefined && r.finops?.sessions) {
      const over = r.finops.monthlyRunRateUsd - a.monthlyBudgetUsd;
      p.log.message(over > 0 ? pc.red(m.overBudget(over)) : pc.green(m.withinBudget));
    }

    if (o.ai) {
      const provider = await detectProvider();
      if (!provider) return p.outro(m.noAiProvider);
      const prompt = await buildConsultPrompt(c.root, r);
      if (provider !== "ollama") {
        const ok = await p.confirm({ message: m.confirmSend(prompt.length, provider), initialValue: false });
        if (p.isCancel(ok) || !ok) return p.outro(m.nothingSent);
      }
      s.start(m.consulting(provider));
      const answer = await askAi(provider, prompt).catch((e: Error) => `Error: ${e.message}`);
      s.stop(m.secondOpinion);
      console.log(answer);
    }
    p.outro(m.goodbye);
  });

program
  .command("history [path]")
  .description("Health Score history for a project (or all with --all)")
  .option("--all", "show every project")
  .action((dir: string | undefined, o: { all?: boolean }) => console.log(render.history(loadHistory(o.all ? undefined : path.resolve(dir ?? ".")))));

common(program.command("ui [path]").description("open the local Web UI (127.0.0.1 only)"))
  .option("--port <n>", "port", "7337")
  .option("--no-open", "do not open the browser")
  .action(async (dir: string | undefined, o: Common & { port: string; open: boolean }) => {
    const c = ctx(dir, o);
    const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
    const { url } = await startServer({ root: c.root, lang: c.lang, days: c.days, port: Number(o.port), publicDir }).catch(fail);
    console.log(`${pc.bold("🩺 ctxmedic UI")}  ${pc.cyan(url)}\n${pc.dim("Ctrl+C to stop. Listening on 127.0.0.1 only.")}`);
    if (o.open) {
      const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
      spawn(cmd, [url], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    }
  });

program.parseAsync().catch(fail);
