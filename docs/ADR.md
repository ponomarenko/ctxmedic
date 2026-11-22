# Architecture Decision Records

Short records of decisions made while building ctxmedic. Newest at the bottom.

## ADR-001 Monorepo and build
pnpm workspaces; TypeScript; `tsup` builds only the published `ctxmedic` CLI
and bundles every internal `@ctxmedic/*` package into it (`noExternal`). The
internal packages are `private`, export `src/index.ts` directly, and have no
build step. Only one npm package ships, so internal APIs can change freely.

## ADR-002 Contracts
Zod schemas are the single source of truth; TS types are `z.infer`. Engine
contracts live in `packages/core/src/schema.ts`; clinical contracts live in
`packages/clinical/src/schema.ts`. The `--json` output and every HTTP response
are validated against them.

## ADR-003 CLI and server stack
`commander` + `@clack/prompts` + `picocolors`. Server: `hono` +
`@hono/node-server`. **Shortcut:** no WebSocket in v0.1; the UI fetches on
demand. Upgrade when the UI needs live updates (for example, a log watcher).

## ADR-004 Token counting
`js-tiktoken` with `cl100k_base` for every harness. Anthropic does not publish
an offline tokenizer; cl100k differs by roughly ±15% on English Markdown. The
counts are for thresholds and trends, not for billing. Billing numbers come
from real `usage` fields in session logs.

## ADR-005 Pricing
A static price table (`packages/finops/src/pricing.ts`) with an `asOf` date.
Unknown models fall back to a Sonnet-class price and are flagged as estimated.

## ADR-006 FixEngine safety
Every write first copies the original into
`.ctxmedic/backups/<timestamp>/<relative path>` with a `manifest.json`. A fix
is refused when a target file has uncommitted git changes, unless `--force`.
Outside a git repository the check is skipped (backups still happen).
Fixes never touch files outside the scanned project root, except when the
user passes `--global`.

## ADR-007 Localization
A plain dictionary per language (`en`, `uk`) in `packages/clinical/src/i18n.ts`,
selected by `--lang` or `CTXMEDIC_LANG`. No i18n library.
**Superseded by ADR-015.**

## ADR-008 Privacy
No telemetry, no network calls, except `consult --ai`, which the user asks
for explicitly (Ollama on localhost, or BYOK through `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY` with plain `fetch`). The UI server binds to `127.0.0.1` and
needs a random per-run token for any write request.

## ADR-009 Secret detection
A fixed set of regexes for well-known key formats (Anthropic, OpenAI, GitHub,
AWS, Slack, Google, Stripe) plus generic `*_KEY|TOKEN|SECRET` assignments with
a high-entropy value. A finding is critical only if the file is not ignored
by git (`git check-ignore`). Reported values are always masked.

## ADR-010 Duplicate detection
Jaccard similarity over normalized line sets (lowercased, whitespace
collapsed, lines shorter than 8 chars dropped). Simpler than shingling and
good enough for instruction files that are copied and lightly edited.

## ADR-011 Session log parsing
Logs are read line by line; malformed lines are skipped, never fatal. Parsed
per-file aggregates are cached in `~/.ctxmedic/cache.json`, keyed by path,
`mtime`, and size. Cursor transcripts carry no token usage, so Cursor only
contributes step counts and tool calls (best effort).

## ADR-012 Health Score
`100 − Σ penalty`, clamped to 0–100. Penalty per finding: critical 25,
warning 8, info 2. Each rule's total penalty is capped at 2× its single
penalty so that one noisy rule cannot sink the score. FinOps findings use the
same weights.

## ADR-013 Home directory override
All global paths resolve from `CTXMEDIC_HOME` (default `os.homedir()`), so
tests and CI can run against fixture homes. ctxmedic's own state lives in
`$CTXMEDIC_HOME/.ctxmedic/`.

## ADR-014 Team / Enterprise
Not built in v0.1. The seam is the `Rule` and `Detector` registries plus the
JSON report: a future paid edition can add rule packs and consume reports
without changing the core.

## ADR-015 English is the project language; more languages later
All code, docs, CLI output, reports and the Web UI are English only. This keeps
one source of truth, and English text costs several times fewer tokens than
Cyrillic when agents read the repository.

The seam for more languages stays:
- `Lang` in `packages/clinical/src/schema.ts` lists supported codes (only `en`).
- `packages/clinical/src/i18n.ts` holds one `Messages` catalog per language
  (diagnosis cards, report text, CLI prompts). TypeScript fails the build if a
  catalog misses a key.
- `packages/ui/src/App.tsx` has its own `L` catalog; the language switch only
  shows when there is more than one language.
- `--lang` and `CTXMEDIC_LANG` still exist; unknown codes fall back to English.

To add a language: add its code to `Lang`, a `Messages` catalog, and an `L`
entry in the UI. The Ukrainian catalog from v0.1 is in git history (commit
`9fed11c`) if it is needed again.

## ADR-016 Restore
`ctxmedic restore <id|latest>` undoes one fix from its backup
(`restoreBackup` in `packages/core/src/fix.ts`). The manifest
(`BackupManifest` in `core/src/schema.ts`) records, per path, what the fix
left there: a SHA-256 of the written content or the symlink target. Restore
refuses, before writing anything, when a path no longer matches (the user
edited it after the fix), unless `--force`. Backups from v0.1.0 lack this
record and need `--force`.

Restore only touches paths inside the project root and backup copies inside
the backup folder, so a tampered manifest cannot write elsewhere. Folders a
fix created (for example `.ai/`) are left in place, empty, after restore.
