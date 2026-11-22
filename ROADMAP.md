# Roadmap

Milestones only. Each item is a GitHub issue with the full brief; the
[milestones page](https://github.com/ponomarenko/ctxmedic/milestones) shows progress.

## v0.1 Release

The first public version (built and merged in #1).

- [ ] Publish v0.1.0 to npm and create the GitHub release (#2)
- [ ] Inject the CLI version at build time (#3)

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

## Team Edition (commercial)

- [ ] Design the Team / Enterprise edition (#13)

## How to work on an item

1. Start a fresh agent session and ask it to implement the issue (`gh issue view <n>`).
2. The agent reads `CLAUDE.md`, the issue and `docs/ADR.md`.
3. It opens a PR with `Closes #<n>` and records new decisions in `docs/ADR.md`.
4. Tick the box here when the PR is merged.
