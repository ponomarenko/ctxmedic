# Roadmap

Milestones only. Each item is a GitHub issue with the full brief; the
[milestones page](https://github.com/ponomarenko/ctxmedic/milestones) shows progress.

## v0.1 Release

The first public version (built and merged in #1).

- [x] Publish v0.1.0 to npm and create the GitHub release (#2)
- [x] Inject the CLI version at build time (#3)

## v0.2 Accuracy & Safety

More precise numbers, undo for fixes, tests for every entry point.

- [ ] `ctxmedic restore` to undo fixes from backups (#4)
- [ ] Measure real MCP schema sizes (#5)
- [ ] Flag and extend pricing for unknown models (#6)
- [ ] History: compare only visits with the same scan options (#7)
- [ ] Tests for the CLI and the local API server (#8)
- [ ] `consult --ai`: streaming, timeout and refusal fallback (#9)
- [ ] GitHub Action: ctxmedic CI gate (#12)
- [ ] Complete `docs/SPEC.md` and reconcile it with the build (#14)

## v0.3 Web UI

- [ ] Graph tab: automatic layout and legend (#10)
- [ ] Live UI updates when config files change (#11)

## v0.4 Rule ecosystem

ESLint-style rules, step by step (ADR-020). The first step is done: config
file, levels, options, `ignores`, inline disables, rule `meta` and
[rule docs](docs/rules/README.md).

- [ ] `FIN_*` detectors as `Rule` objects with `meta` and options (thresholds from config)
- [ ] JSON Schema for `ctxmedic.config.json` (`$schema`, editor autocomplete), generated from Zod
- [ ] `ctxmedic rules`: list rules with meta and the effective config
- [ ] Line-level disables and a report of unused disable comments
- [ ] Shareable configs: `extends` with built-in presets (`recommended`, `strict`)
- [ ] Rule ids with namespaces (`plugin/RULE`): open `RuleId`, catalog cards and score weights for external rules
- [ ] Plugins: load rules from npm packages, opt-in, with a privacy ADR (plugin code can reach the network)

## v0.5 Content diagnostics

Check what instruction files say, not only how big they are. Only deterministic
checks become rules; semantic judgment stays in `consult --ai`.

- [ ] Stale references: file paths and commands in instruction text that no longer exist (#61)
- [ ] Toolchain overlap: instructions that restate settings already enforced by ESLint, Prettier, Biome or EditorConfig (#62)
- [ ] Duplicate instructions inside one file and across files loaded by the same harness (#63)
- [ ] Off-stack instructions: rules for languages or frameworks the project does not use (#64)
- [ ] Path-specific instructions written as global (suggest scoped rule files) (#65)
- [ ] No-effect instructions ("write clean code"), info level (#66)
- [ ] Token budget by section type (rules, examples, tables, decoration), with trimmable parts flagged (#67)
- [ ] Skills: per-skill token budget and overlapping skill triggers (#68)
- [ ] `consult --ai`: ask for contradictions and verbose phrasing, with suggested rewrites (#69)

## v0.6 Session waste

New `FIN_*` detectors that find avoidable token spend in session logs. ctxmedic
stays a read-only diagnosis; prescriptions name the runtime fix.

- [ ] Repeated reads of the same unchanged file in one session (#70)
- [ ] The same shell command run three or more times (#71)
- [ ] Oversized tool output in context (test runners, installs, builds, linters) (#72)
- [ ] Full-resolution images and screenshots (#73)
- [ ] The same URL fetched more than once (#74)
- [ ] The same skill loaded more than once per session (#75)
- [ ] Large reads carried in the prompt cache: cost of the cache write plus every later cache read until compaction (#76)
- [ ] Re-reads after compaction (context lost to the summary) (#77)
- [ ] Measure detector accuracy and savings on a corpus of real sessions and publish the numbers (#78)

## v0.7 Adoption & trust

- [ ] `ctxmedic install <agent>`: add a skill or rule so the agent runs a checkup on request (#79)
- [ ] `ctxmedic init`: healthy starter instruction files per harness (#80)
- [ ] `ctxmedic explain <RULE>`: the rule card in the terminal (#81)
- [ ] `ctxmedic capabilities`: what the build can do (network, writes), with the setting and code that enforce each; a test fails the build if a module can open a network connection (#82)
- [ ] Security settings (secret masking, write limits) cannot be weakened by a checked-in config; the report names environment overrides (#83)
- [ ] Status line: Health Score and session cost in the agent's status line (#84)
- [ ] Terminal trend view of history: score and cost sparklines (#85)
- [ ] Pre-commit hook recipe (#86)
- [ ] Documented programmatic API (`checkup`, `examine`) in the published package (#87)

## Team Edition (commercial)

- [ ] Design the Team / Enterprise edition (#13)

## How to work on an item

1. Start a fresh agent session and ask it to implement the issue (`gh issue view <n>`).
2. The agent reads `CLAUDE.md`, the issue and `docs/ADR.md`.
3. It opens a PR with `Closes #<n>` and records new decisions in `docs/ADR.md`.
4. Tick the box here when the PR is merged.
