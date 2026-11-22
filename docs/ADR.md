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

## ADR-017 History compares like with like
Each `Visit` stores its `scan` settings (`global`, `finops`, `days`;
`ScanSettings` in `packages/clinical/src/schema.ts`). "Since the last visit"
and the UI trend use only visits with the same settings (`sameScan` in
`store.ts`), so a `--no-global` run cannot create a fake jump in the trend of
full runs. `days` counts only when session logs were analyzed. `ctxmedic
history` still lists every visit and tags non-default ones with their flags.
History written by v0.1.0 has no settings and loads as default runs, the most
common case, so existing trends continue.

## ADR-018 Measured MCP schema sizes
`FIN_UNUSED_MCP` prices the tool definitions an idle MCP server adds to every
request. The parsers now measure them from the logs, without starting any
server:
- Claude Code: `api-request-shape` lines carry `shape.tools`, the definitions
  sent with each request. Tools named `mcp__<server>__*` are grouped per server.
- Codex: `response_item` lines with `payload.type: "additional_tools"` hold one
  `mcp__<server>` namespace per server.

Each server's definitions are counted with `countTokens` on their JSON; a
session keeps the largest size seen, and the detector takes the largest across
sessions. A server never seen in the logs falls back to `MCP_SCHEMA_TOKENS`
(1,500). The finding's `data.estimated` is `false` only when every idle server
was measured, and the card says which one was used. The parse cache moved to
`v: 3` so old aggregates are re-parsed. Tools that Claude Code defers (loaded
on demand) are not in `shape.tools` and are not priced.

## ADR-019 Pinned supply chain
The GitHub Action no longer installs `ctxmedic@latest` by default. With an
empty `version` input it reads `packages/cli/package.json` from its own
checkout (`$GITHUB_ACTION_PATH`), so `@v0.2.1` or a commit SHA runs exactly the
CLI released with that commit, and `@v0` moves only when the major tag moves.
A hijacked npm release would otherwise reach every user on the next run.
Workflows pin third-party actions to commit SHAs with the version in a comment;
Dependabot updates both. OpenSSF Scorecard runs weekly and publishes a public
score for the README badge.

## ADR-020 Rule configuration, ESLint style
Users tune rules the way ESLint users do, as the first step towards a rule
ecosystem (see the roadmap, "v0.4 Rule ecosystem").
- **Config file.** `ctxmedic.config.json` in the scanned root, validated by
  `CtxmedicConfig` (`packages/core/src/config.ts`). JSON only: a JS config
  would run project code on `checkup`, which a local diagnostic tool should
  not do by default. An invalid config stops the run (`ConfigError`); it never
  falls back to defaults silently.
- **Levels.** `"off" | "on" | Severity`. `"on"` keeps the severity the rule
  picks, because our rules grade findings (bloat is a warning, 3× bloat is
  critical); ESLint's `warn`/`error` would flatten that. A severity forces it.
- **Options.** `[level, options]`. A rule declares `meta.options` as a Zod
  schema with defaults, so options are checked at load time and the rule gets
  typed, complete options. Thresholds move from constants into options.
- **Rule meta.** Every core rule has `meta` (`description`, `type`, `docs`,
  `fixable`, `options`), and every rule id has a page in `docs/rules/`. A test
  fails when a core rule has no page.
- **Suppression.** `ignores` (globs over the paths a finding reports; dropped
  only when every path matches) and `<!-- ctxmedic-disable [IDS] [-- reason] -->`
  in Markdown, which silences matching findings that report that file. Both run
  in `applyConfig`, after the rules, so `examine` and `analyze` filter the same
  way; turned-off rules are not run at all.
- **Score and history.** Dropped findings do not count. `ScanSettings.config`
  holds `configHash` of the levels, options and `ignores` ("" without a config,
  and for older history), so the trend compares only visits with the same
  config (extends ADR-017).

Known limits: `FIN_*` detectors take no options and have no `meta` yet (they
are functions in `finops`, not `Rule` objects); disables are per file, not per
line; adding or removing an inline disable comment changes the score without
starting a new trend, like any other edit to the files.
