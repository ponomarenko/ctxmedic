# Changelog

## Unreleased

- `ctxmedic restore` undoes a fix from its backup.
- GitHub Action (`action.yml`): CI gate with a job summary and file annotations.
- The CLI version comes from `package.json` at build time.
- `FIN_UNUSED_MCP` uses real MCP tool-schema sizes from Claude Code and Codex logs when they are recorded; the card says whether the number is measured or estimated.
- History compares only visits scanned with the same `--no-global`, `--no-finops` and `--days` (fixes fake "+N since the last visit" jumps).

## 0.1.0 — 2026-11-22

First public version.

- `checkup`, `treat`, `savings`, `consult`, `history`, `ui` commands.
- 7 config rules and 4 FinOps detectors for Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, GitHub Copilot and Cline.
- Clinical cards, Health Score, visit history. English output; message catalogs ready for more languages.
- Safe FixEngine with backups and git checks.
- Local Web UI (dashboard, diagnoses, FinOps, config graph).
