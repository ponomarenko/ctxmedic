# ctxmedic: original product spec

> English translation of the original spec (written in Ukrainian) that v0.1 was built
> from. The text **stops at Stage 2, item 3** (ClinicalEngine). Stages 3+ (CLI,
> server, UI, release) were derived from section 2 and recorded in `docs/ADR.md`.
> The missing part is tracked in issue #14.
>
> Since then: the author's name uses the passport spelling (Vitalii; earlier Vitaliy),
> and English is the only interface language for now (ADR-015).

---

# Autonomy and orchestration directive

**Autonomy:** all architecture, product and legal decisions are fixed in the spec below.
Do not stop for clarifying questions. When a small technical dilemma comes up, take the
most reliable engineering decision, record it in `docs/ADR.md` and keep following the plan.

You are a Principal Software Architect, Product Strategist and Tech Lead. Design and
build from scratch the open-source product **ctxmedic** for its author **Vitalii
Ponomarenko** (`https://github.com/ponomarenko`, repository
`https://github.com/ponomarenko/ctxmedic`, npm package
`https://www.npmjs.com/package/ctxmedic`) under the **FSL-1.1-MIT** license.

Work as an **orchestrator**. Split the work into sequential stages, keep strictly to the
data contracts (`TypeScript` + `Zod`), and record the architecture decisions of each
stage before writing its code. If your environment supports subagents, delegate
separate monorepo packages to them while keeping the interfaces shared.

---

# 1. Product vision, clinical persona and business model

## Concept

**ctxmedic** is a tool-agnostic local diagnostic center, linter, auto-fixer,
**token-cost (FinOps) optimizer** and visual control plane for a developer's AI setup
(Claude Code, Cursor, Windsurf, Codex CLI, OpenCode, Cline, GitHub Copilot).

## Unique UX: "a real general practitioner" (clinical persona and triage)

The tool runs an appointment like an experienced, empathetic and pragmatic diagnostic
doctor. The default interface language is English, with an architecture ready for more
languages through a `--lang` flag.

- **Triage of the patient (the project):** problems are ranked by urgency:
  🔴 **Resuscitation / Critical** (act now), 🟡 **Therapy / Warning** (needs treatment),
  🟢 **Preventive / Info** (prevention).
- **A clinical card for every diagnosis:**
  - *Diagnosis*: a medical-engineering metaphor plus the rule code (for example
    `Context Obesity [WARN_CONTEXT_BLOAT]`, `Toxic MCP Syndrome [FIN_UNUSED_MCP]`).
  - *Vitals & lab results*: exact numbers: token counts, file paths, cache hit ratio,
    call statistics from logs.
  - *Prognosis (without treatment)*: how it hurts the model's attention (lost in the
    middle), causes hallucinations, and costs money ($/month).
  - *Prescription (`Rx`)*: one concrete action with the expected **Health Score** gain
    and savings, runnable in one step (`ctxmedic treat RX-01`).
- **Recovery dynamics:** keep the history of checkups in `~/.ctxmedic/history.json` to
  compare the current Health Score with earlier visits.
- **Interactive appointment (`ctxmedic consult`):** a questionnaire that collects the
  developer's history (saving money vs. maximum quality, main harness, monthly budget)
  and builds a personal treatment plan.

## Business model and legal protection of the author

- **Licensor / original author:** Vitalii Ponomarenko (`https://github.com/ponomarenko`)
- **Copyright year:** 2026
- **Open-core / source-available model:**
  - *Community Edition (CLI + local Web UI):* source available under **FSL-1.1-MIT**
    (Functional Source License 1.1, converts to MIT after 2 years) + **CLA.md** +
    **TRADEMARKS.md** (protects the `ctxmedic` name and brand).
  - *Team / Enterprise Edition (architecture seam only):* a future paid tier (team
    sync of reference skills, CI/CD security gates, central FinOps monitoring).
- **100% privacy, local-first:** no telemetry; prompts, session logs and secrets never
  leave the user's machine.

---

# 2. Technical architecture and monorepo stack

- **Build and compatibility:** `pnpm` workspaces + TypeScript + `tsup`. The `ctxmedic`
  CLI package must run through `npx ctxmedic` on standard **Node.js 20+** with no
  external system dependencies. The built frontend (`packages/ui/dist`) is copied into
  `packages/cli/public` at build time and served by a local Hono server on
  `ctxmedic ui`.
- **Monorepo layout:**
  - `packages/core`: file-system scanner, symlink resolver, parsers (Markdown, YAML
    frontmatter, JSON/JSONC), token counting (`js-tiktoken`), dependency graph, rule
    engine, and a safe `FixEngine` (mandatory backups in
    `.ctxmedic/backups/<timestamp>/` before changing files, plus a `git status` check).
  - `packages/harnesses`: a declarative registry of harness profiles (Claude Code,
    Cursor, Windsurf, Codex CLI, OpenCode, GitHub Copilot): global and project config
    paths, context limits, skill loading rules.
  - `packages/finops`: offline analyzer of AI usage logs and token savings, with an
    incremental cache of parsed files in `~/.ctxmedic/cache.json` keyed by `mtime` and
    size.
  - `packages/clinical`: the medical interpretation engine: turns raw metrics and rule
    hits into clinical diagnoses, prognoses and prescriptions (`Rx`), computes the
    Health Score (0–100) and runs the `consult` questionnaire.
  - `packages/cli`: terminal interface (`commander` or `citty` + `@clack/prompts` +
    styled medical output cards).
  - `packages/server`: a light local HTTP/WebSocket API server (Hono) for the Web UI.
  - `packages/ui`: SPA on React + Vite + Tailwind CSS + Lucide icons + React Flow.

---

# 3. Diagnostic and FinOps engine

## Module A: config and architecture diagnostics (`packages/core`)

1. **Broken links and symlink drift (`ERR_BROKEN_LINK`):** broken symlinks, circular
   links, absolute paths instead of relative ones.
2. **Context obesity (`WARN_CONTEXT_BLOAT`):** base instructions over the token
   threshold (more than 3,500 tokens at session start).
3. **Instruction duplication (`WARN_DUPLICATE_RULES`):** more than 75% similar text
   between `CLAUDE.md`, `AGENTS.md` and `.cursorrules`, with a prescription to migrate
   to a canonical hub-and-spoke layout (`.ai/` + symlinks).
4. **Skill schema and trigger hygiene (`ERR_INVALID_SKILL`):** validate `SKILL.md`
   (YAML frontmatter, unique names, quality of trigger descriptions).
5. **Secret exposure (`CRIT_SECRET_LEAK`):** API keys in configs or MCP files that are
   not git-ignored.
6. **Cross-harness syntax conflict (`INFO_UNSUPPORTED_SYNTAX`):** directives of one
   agent (for example `@import` or `alwaysApply`) in files read by another agent that
   does not support them.
7. **Optional AI consilium (`ctxmedic consult --ai`):** on explicit request, connect a
   local model (Ollama) or bring-your-own-key (Anthropic/OpenAI) to find logical
   contradictions between rules and outdated prompt workarounds.

## Module B: FinOps and token savings (`packages/finops`)

Offline parsing of local session logs:

- **Claude Code:** `~/.claude/projects/**/*.jsonl`
- **Codex CLI:** `~/.codex/sessions/**/rollout-*.jsonl`
- **Cursor:** `~/.cursor/projects/*/agent-transcripts/*.jsonl`

Detect overspending patterns and generate savings prescriptions ($ and %):

1. **Toxic / unused MCP syndrome (`FIN_UNUSED_MCP`):** a connected MCP server adds
   thousands of schema tokens to every request but was called 0 times in 14/30 days.
   *Rx:* move it from the global config into the config of the project that needs it.
2. **Model overkill (`FIN_MODEL_OVERKILL`):** expensive frontier/reasoning models
   (Opus, o3) used for trivial one-turn tasks or routine skills. *Rx:* assign lighter
   models (Sonnet/Haiku/mini) to those skills or subagents.
3. **Context snowball (`FIN_CONTEXT_SNOWBALL`):** long sessions (more than 35 steps)
   without `/clear` or `/compact`, where every step carries 100k+ tokens of history.
   *Rx:* where to reset context and how to set up auto-compaction.
4. **Prompt cache thrashing (`FIN_CACHE_MISS`):** low cache hit ratio (under 40%)
   because of dynamic inserts at the top of system instructions or frequent model
   switches. *Rx:* reorder instructions for maximum caching.
5. **Bloat indexing (`FIN_BLOAT_IGNORE`):** no `.cursorignore` or exclusion rules for
   lockfiles, `dist/` and build artifacts. *Rx:* generate an optimal ignore file.

---

# 4. Execution plan (stages)

### Stage 1: monorepo setup, legal protection and data schemas

1. Set up the `pnpm` monorepo (`packages/core`, `harnesses`, `finops`, `clinical`,
   `cli`, `server`, `ui`), `tsconfig.base.json`, `vitest`, and build/publish scripts
   for npm (`ctxmedic`) with the author metadata
   `Vitalii Ponomarenko <https://github.com/ponomarenko>`.
2. Generate the full set of legal files in the repository root:
   - `LICENSE`: full **FSL-1.1-MIT** text naming the rights holder:
     `Copyright (c) 2026 Vitalii Ponomarenko (https://github.com/ponomarenko)`.
   - `NOTICE`: official authorship notice of Vitalii Ponomarenko.
   - `LICENSE_COMMERCIAL.md`: how to obtain a commercial/team license from Vitalii
     Ponomarenko.
   - `CLA.md`: Contributor License Agreement protecting Vitalii Ponomarenko's rights.
   - `TRADEMARKS.md`: protection of the `ctxmedic` name and brand.
   - `SECURITY.md`, `CONTRIBUTING.md` and `.github/workflows/ci.yml`.
3. Implement the base data contracts in `packages/core` and `packages/clinical`
   (`ClinicalDiagnosis`, `PrescriptionRx`, `PatientVitals`, `FinOpsReport`,
   `HarnessProfile`).

### Stage 2: core scanner, FinOps engine and clinical persona

1. Implement the file-system scanner and the profiles of 6 harnesses
   (`packages/harnesses`).
2. Implement the 7 config diagnostic rules and the log parsers (`packages/finops`) with
   real costs, cache hit ratio and potential savings in dollars.
3. Implement the `ClinicalEngine` (`packages/clinical`), which produces **

<!-- The original spec text stops here. The rest is tracked in issue #14. -->
