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
  resolveLang,
  saveAnamnesis,

  VERSION,
  type Anamnesis,
  type Lang,
} from "@ctxmedic/clinical";
import { applyFix, examine, FixRefusedError, type FixPlan } from "@ctxmedic/core";
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
    .option("--lang <lang>", "interface language: en | uk")
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
    if (manual.length === picked.length) return console.log(pc.yellow(c.lang === "uk" ? "Автофіксу немає: виконайте рецепт вручну." : "No auto-fix: follow the prescription by hand."));
    const plans = picked.flatMap((d) => (d.finding.fix ? [d.finding.fix as FixPlan] : []));
    for (const plan of plans) for (const op of plan.ops) console.log(pc.dim(`  ${op.kind === "write" ? "write  " : "symlink"} ${path.relative(c.root, op.path)}${op.kind === "symlink" ? ` → ${op.target}` : ""}`));
    if (!o.dryRun && !o.yes) {
      const ok = await p.confirm({ message: c.lang === "uk" ? "Застосувати? (оригінали буде збережено в .ctxmedic/backups)" : "Apply? (originals are backed up to .ctxmedic/backups)" });
      if (p.isCancel(ok) || !ok) return p.cancel("Cancelled");
    }
    for (const plan of plans) {
      const res = await applyFix(plan, { root: c.root, dryRun: o.dryRun, force: o.force, global: false }).catch(fail);
      console.log(`${o.dryRun ? pc.yellow("dry-run") : pc.green("✔")} ${plan.title}${res.dryRun ? "" : pc.dim(`  backup: ${path.relative(c.root, res.backupDir)}`)}`);
    }
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
    const uk = c.lang === "uk";
    p.intro(pc.bold(uk ? "🩺 Прийом у ctxmedic" : "🩺 ctxmedic consultation"));
    const prev = loadAnamnesis();
    const priority = await p.select({
      message: uk ? "Що для вас важливіше?" : "What matters most to you?",
      initialValue: prev.priority,
      options: [
        { value: "economy", label: uk ? "Економія токенів і грошей" : "Saving tokens and money" },
        { value: "balanced", label: uk ? "Баланс" : "Balanced" },
        { value: "quality", label: uk ? "Максимальна якість відповідей" : "Maximum answer quality" },
      ],
    });
    if (p.isCancel(priority)) return p.cancel("Cancelled");
    const primaryHarness = await p.select({
      message: uk ? "Ваш основний інструмент?" : "Your main AI tool?",
      initialValue: prev.primaryHarness ?? "claude-code",
      options: harnesses.map((h) => ({ value: h.id, label: h.name })),
    });
    if (p.isCancel(primaryHarness)) return p.cancel("Cancelled");
    const budget = await p.text({
      message: uk ? "Місячний бюджет на AI, $ (порожньо — без ліміту)" : "Monthly AI budget in $ (empty = no limit)",
      initialValue: prev.monthlyBudgetUsd?.toString() ?? "",
      validate: (v) => (v && !(Number(v) >= 0) ? (uk ? "Введіть число" : "Enter a number") : undefined),
    });
    if (p.isCancel(budget)) return p.cancel("Cancelled");
    const a: Anamnesis = { priority: priority as Anamnesis["priority"], primaryHarness: primaryHarness as string, monthlyBudgetUsd: budget ? Number(budget) : undefined };
    saveAnamnesis(a);

    const s = p.spinner();
    s.start(uk ? "Обстежуємо пацієнта" : "Examining the patient");
    const r = await checkup(c).catch(fail);
    s.stop(`${uk ? "Індекс здоров'я" : "Health Score"}: ${r.healthScore}/100`);
    const course = r.diagnoses.filter((d) => !a.primaryHarness || !d.finding.data.harness || d.finding.data.harness === a.primaryHarness || d.triage === "resuscitation").slice(0, 5);
    p.note(course.map((d, i) => `${i + 1}. ${d.rx.id} ${d.diagnosis}: ${d.rx.action}${d.rx.command ? `\n   → ${d.rx.command}` : ""}`).join("\n") || r.opinion, uk ? "Курс лікування" : "Treatment plan");
    if (a.monthlyBudgetUsd !== undefined && r.finops?.sessions) {
      const over = r.finops.monthlyRunRateUsd - a.monthlyBudgetUsd;
      p.log.message(over > 0 ? pc.red(`${uk ? "Перевищення бюджету" : "Over budget by"} $${over.toFixed(2)}/mo`) : pc.green(uk ? "У межах бюджету" : "Within budget"));
    }

    if (o.ai) {
      const provider = await detectProvider();
      if (!provider) return p.outro(uk ? "Немає Ollama або ANTHROPIC_API_KEY / OPENAI_API_KEY: AI-консиліум пропущено." : "No Ollama, ANTHROPIC_API_KEY or OPENAI_API_KEY: AI review skipped.");
      const prompt = await buildConsultPrompt(c.root, r);
      if (provider !== "ollama") {
        const ok = await p.confirm({
          message: uk
            ? `Надіслати ${prompt.length.toLocaleString("en")} символів ваших інструкцій (секрети замасковано) до ${provider}?`
            : `Send ${prompt.length.toLocaleString("en")} characters of your instructions (secrets redacted) to ${provider}?`,
          initialValue: false,
        });
        if (p.isCancel(ok) || !ok) return p.outro(uk ? "Нічого не надіслано." : "Nothing was sent.");
      }
      s.start(uk ? `Консиліум (${provider})` : `Consulting ${provider}`);
      const answer = await askAi(provider, prompt).catch((e: Error) => `Error: ${e.message}`);
      s.stop(uk ? "Висновок консиліуму" : "Second opinion");
      console.log(answer);
    }
    p.outro(uk ? "Одужуйте! Повторний огляд: ctxmedic checkup" : "Get well soon! Follow-up: ctxmedic checkup");
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
