# ctxmedic

> The context medic for your AI coding setup.

ctxmedic examines the AI configuration of a project like a doctor examines a
patient. It reads your `CLAUDE.md`, `AGENTS.md`, Cursor/Windsurf/Copilot/Cline
rules, skills and MCP configs, plus your local session logs, then gives you a
**Health Score**, triaged **diagnoses**, and one-step **prescriptions** that
save tokens and money.

Works with Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, GitHub Copilot
and Cline. 100% local: nothing leaves your machine.

```bash
npx ctxmedic checkup
```

```
🩺 ctxmedic 0.1.0 · ~/code/my-app
   Health Score: ████████████████░░░░ 82/100  (+4 since the last visit)
   Stable, but a few conditions need therapy.
   🔴 Resuscitation 0   🟡 Therapy 1   🟢 Preventive 3   ·   Potential savings: $69.20/mo

╭─ 🟡 Therapy · RX-01  Context Snowball [FIN_CONTEXT_SNOWBALL]
│ 11 session(s) ran >35 steps with 100k+ context and no /clear or /compact
│ Vitals     Worst Steps: 266 · Worst Max Context: 452,169
│ Prognosis  Each step re-reads the whole history; quality drops as it grows.
│ Rx         Run /compact at task milestones and /clear between unrelated tasks.
│            (+8 health, $68.80/mo)
╰─
```

## Commands

| Command | What it does |
|---|---|
| `ctxmedic checkup [path]` | Full examination. `--json` for machines, exit code 1 on 🔴 findings (CI gate). |
| `ctxmedic treat RX-01` | Apply one prescription. `--all`, `--dry-run`, `--force`, `-y`. |
| `ctxmedic restore [backup\|latest]` | Undo a fix from `.ctxmedic/backups`. No argument lists backups. `--dry-run`, `--force`. |
| `ctxmedic savings` | FinOps only: spend, run rate, cache hit ratio, savings. |
| `ctxmedic consult [--ai]` | Interactive appointment: your priorities, budget and main tool shape the treatment plan. `--ai` asks local Ollama or your own Anthropic/OpenAI key for a second opinion. |
| `ctxmedic history` | Health Score over time. |
| `ctxmedic ui` | Local Web UI on `127.0.0.1`: dashboard, diagnoses, FinOps, config graph. |

Common options: `--days 30`, `--no-finops`, `--no-global`.

## GitHub Action

Gate pull requests on the health of your AI configs. The action runs
`ctxmedic checkup --no-global --no-finops`, writes the cards to the job summary,
annotates the files, and fails the job on 🔴 findings.

```yaml
# .github/workflows/ctxmedic.yml
name: ctxmedic
on: pull_request
jobs:
  checkup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ponomarenko/ctxmedic@main # pin a release tag once one includes the action
        with:
          fail-on: critical # or "warning" to fail on 🟡 too
          # path: .        # project folder
          # version: 0.1.0 # ctxmedic version from npm (default: latest)
```

Nothing leaves the runner: no telemetry, no network calls besides installing the
package from npm.

## Diagnoses

| Code | Diagnosis | Auto-fix |
|---|---|---|
| `ERR_BROKEN_LINK` | Symlink Necrosis: broken, circular or absolute symlinks | relative links |
| `WARN_CONTEXT_BLOAT` | Context Obesity: > 3,500 tokens loaded at session start | — |
| `WARN_DUPLICATE_RULES` | Instruction Duplication: > 75% similar instruction files | hub-and-spoke `.ai/` + symlinks |
| `ERR_INVALID_SKILL` | Skill Amnesia: bad `SKILL.md` frontmatter, names, triggers | — |
| `CRIT_SECRET_LEAK` | Credential Hemorrhage: API keys in configs (masked in output) | — |
| `INFO_UNSUPPORTED_SYNTAX` | Cross-Harness Allergy: `@import`, `alwaysApply`… read by tools that ignore them | — |
| `FIN_BLOAT_IGNORE` | Indexing Bloat: no `.cursorignore` / `.codeiumignore` | generates it |
| `FIN_UNUSED_MCP` | Toxic MCP Syndrome: MCP servers never called | — |
| `FIN_MODEL_OVERKILL` | Model Overkill: frontier models on one-shot tasks | — |
| `FIN_CONTEXT_SNOWBALL` | Context Snowball: long sessions without `/compact` | — |
| `FIN_CACHE_MISS` | Prompt Cache Thrashing: cache hit ratio < 40% | — |

Every fix backs up the originals to `.ctxmedic/backups/<timestamp>/` and
refuses to touch files with uncommitted git changes unless you pass `--force`.

## Privacy

- No telemetry. No network calls, except `consult --ai`, which asks before it
  sends anything and redacts secrets first.
- Session logs are read from `~/.claude/projects`, `~/.codex/sessions` and
  `~/.cursor/projects`. Parsed totals are cached in `~/.ctxmedic/cache.json`.
- The UI server binds to `127.0.0.1` and requires a per-run token for writes.

## Development

```bash
pnpm install
pnpm typecheck && pnpm test && pnpm build
node packages/cli/dist/index.js checkup
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [docs/ADR.md](./docs/ADR.md).

## License

[FSL-1.1-MIT](./LICENSE) © 2026 [Vitalii Ponomarenko](https://github.com/ponomarenko).
Free for internal use, education and research; each release becomes MIT two
years after it ships. Commercial and team terms: [LICENSE_COMMERCIAL.md](./LICENSE_COMMERCIAL.md).
"ctxmedic" is a trademark: [TRADEMARKS.md](./TRADEMARKS.md).
