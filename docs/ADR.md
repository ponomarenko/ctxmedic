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
`@hono/node-server`. Live updates use Server-Sent Events, not WebSocket:
data only flows from the server to the UI. `GET /api/events` sends `changed`
after a config edit; the UI then re-fetches the checkup and history without
recording a visit. The server watches, without recursion, the folder of every
scanned file plus the folder that holds skills, and counts an event only when
a scanned file's mtime or size, or the list of skill folders, really changed
(macOS replays recent events when a watch starts). Events within 300 ms are
merged. Watchers run only while a UI is connected. Not watched: session logs
(they change every second during a session) and new config files in folders
that hold none yet; the refresh button picks those up.

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

`FIN_*` detectors have `meta` and options too: the contract (`finopsMeta`,
`packages/core/src/rules/finopsMeta.ts`) lives in core so `loadConfig` checks
every rule's options in one place, and the check lives in `finops`, which
depends on core. Detectors turned off do not run.

Disable comments also work per line (`ctxmedic-disable-line`,
`ctxmedic-disable-next-line`) for findings that carry a `line` (1-based, in
their first file), and comments that silence nothing are reported as
`INFO_UNUSED_DISABLE`. That id has meta but no `Rule` object: `applyConfig`
reports it, and only `examine` asks it to, because `FIN_*` log findings never
point at Markdown files.

`extends` applies built-in presets (`ctxmedic:recommended`, `ctxmedic:strict`,
`packages/core/src/presets.ts`) before the file's own settings. A later entry
replaces an earlier one, except that a level alone keeps the earlier options,
as in ESLint; `ignores` add up. `loadConfig` returns the resolved config, so
option checks, `configHash` and `ctxmedic rules` see what actually runs, and a
change to a preset starts a new history trend. Presets from npm packages wait
for plugins.

Known limits: adding or removing an inline disable comment changes the score without
starting a new trend, like any other edit to the files.

## ADR-021 No Anthropic SDK
`consult --ai` calls the Anthropic Messages API with `fetch`, like the OpenAI
and Ollama paths. The SDK was a runtime dependency of every install for one
optional, opt-in call; `optionalDependencies` would not help, because npm
installs them by default. `ANTHROPIC_BASE_URL` still works. The UI typecheck
now lists `node` types explicitly: it imports types from `@ctxmedic/clinical`,
and Node types used to arrive only through the SDK's declarations.

## ADR-022 Release PRs through a GitHub App
release-please opens its release PR with a token from a GitHub App
(`actions/create-github-app-token`), not `GITHUB_TOKEN`. Events made with
`GITHUB_TOKEN` start no workflows, so the required `test (20)` and `test (22)`
checks never ran and every release PR stayed blocked. The App token is
short-lived and scoped to `contents` and `pull-requests` write on this
repository. A personal access token would tie releases to one account and expire.
The App client ID is the `RELEASE_APP_CLIENT_ID` secret; its private key is
the `RELEASE_APP_PRIVATE_KEY` secret.

## ADR-023 consult --ai streams, times out when idle and falls back on the server
The Anthropic call streams (SSE over `fetch`, still no SDK, ADR-021), so a long
review does not hit an HTTP timeout. The timeout is an idle limit, not a total
one: the request fails only when no data arrives for `CTXMEDIC_AI_TIMEOUT_MS`
(default 120 s), so a slow but steady review is never cut off. Ollama and OpenAI
keep single requests with the same limit as a total timeout.
On a refusal the API itself retries: the default model is sent with
`fallbacks: "default"` (beta `server-side-fallback-2026-07-01`), which picks the
fallback model by refusal category. That means one request and no hard-coded
fallback model; a manual retry would send the configuration a second time. The
CLI names the model that answered. A `fallback` block in the stream drops the
declined model's partial text, so the answer is printed only after the stream
ends. With `CTXMEDIC_AI_MODEL` set, no fallback is requested, because the
override model may not accept it.

## ADR-024 FIN_BLOAT_IGNORE is a core rule
The spec lists `FIN_BLOAT_IGNORE` under FinOps (Module B), but it reads no
session logs: it checks whether ignore files (`.cursorignore` and the like)
exclude lockfiles, `dist/` and build output. So it is a core rule
(`packages/core/src/rules/bloatIgnore.ts`) that runs on every `checkup`,
including `--no-finops`, and can fix itself through `applyFix` (it writes the
ignore file). It keeps its `FIN_` id because the cost of indexing those files
is what it reports.


## ADR-025 Graph layout with dagre
The Graph tab lays nodes out with `@dagrejs/dagre` (pure JS, bundled into the
UI only) instead of three fixed columns. The graph is layered by nature
(harness → file → symlink target), which is what dagre does well; `elkjs` lays
out clusters better but is several times larger and usually runs in a web
worker. Files sit in one compound cluster per scope (project, global), drawn as
React Flow parent nodes. Duplicate edges are drawn but left out of the layout,
because they link files of the same rank and would push one of them a rank
further. `/api/graph` now returns the `ConfigGraph` Zod contract
(`packages/core/src/schema.ts`) like every other route (ADR-002). The layout is
a pure function (`layout` in `packages/ui/src/Graph.tsx`) with its own test.
