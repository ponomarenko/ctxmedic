# ctxmedic: notes for AI coding agents

Local diagnostic tool, linter, auto-fixer and token-cost (FinOps) analyzer for AI
coding configs (Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, Copilot, Cline),
presented as a doctor's checkup. Author: Vitalii Ponomarenko. License: FSL-1.1-MIT.

## Where things are

- `docs/SPEC.md`: the original product spec. `ROADMAP.md`: milestones.
  `docs/ADR.md`: every architecture decision. Read the ADRs before changing design.
- Work items are GitHub issues (`gh issue view <n>`). One issue = one branch = one PR
  with `Closes #<n>`.

| Package | Role |
|---|---|
| `packages/core` | Zod contracts (`schema.ts`), scanner, parsers, tokens, 7 rules (`rules/`), `ctxmedic.config.json` (`config.ts`), `applyFix`, `examine` |
| `packages/harnesses` | declarative profiles of supported tools (paths, syntax, logs) |
| `packages/finops` | session-log parsers, price table, 4 cost detectors, parse cache |
| `packages/clinical` | diagnoses, `RX-NN` prescriptions, Health Score, history, message catalogs (`i18n.ts`), `consult --ai` |
| `packages/cli` | the only published package (`ctxmedic`); bundles all internal packages |
| `packages/server` | Hono API for the UI |
| `packages/ui` | React + Vite + Tailwind + React Flow SPA |

## Commands

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
node packages/cli/dist/index.js checkup [path] [--json] [--no-global] [--no-finops]
```

Tests point the home directory at a temp folder with `CTXMEDIC_HOME`; never read the
real `~` in tests.

## Rules that must not break

- Contracts first: change the Zod schema, then the code. JSON output and API responses
  are validated against the schemas.
- Privacy: no telemetry and no network calls. The only exception is `consult --ai`,
  which asks first and redacts secrets.
- Secrets are always masked in output (`mask` / `redactSecrets` in `core/src/secrets.ts`).
- Fixes go through `applyFix`: backup, git-dirty check, no writes outside the root.
- The UI server binds to `127.0.0.1`; write routes require the per-run token.
- A new rule needs: the rule in `core/src/rules/` with `meta` (thresholds as `meta.options`),
  a card in `clinical/src/i18n.ts` (`en` catalog), a page in `docs/rules/`, a fixture test.
- Record new design decisions in `docs/ADR.md`; mark known limits in code as
  `shortcut: <limit>, <when to upgrade>`.
- Node 20+ only, no native dependencies.
- English only: code, comments, docs, issues, CLI and UI text (ADR-015). User-facing
  strings live in message catalogs, never inline, so more languages can be added later.
