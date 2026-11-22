# Contributing

1. Read and accept the [CLA](./CLA.md). Pull requests without the CLA line
   cannot be merged.
2. `pnpm install`, then `pnpm typecheck && pnpm test && pnpm build`.
3. Keep changes small. Add a test for every new rule, parser, or fix.
4. Record any architecture decision in [docs/ADR.md](./docs/ADR.md).
5. Never commit real logs, configs, or keys. Test fixtures use fake values.

## Layout

| Package | Role |
|---|---|
| `packages/core` | scanner, parsers, tokens, rule engine, FixEngine, contracts |
| `packages/harnesses` | declarative profiles of supported AI tools |
| `packages/finops` | offline session-log parsing and savings detectors |
| `packages/clinical` | diagnoses, prescriptions, Health Score, history, consult |
| `packages/cli` | the published `ctxmedic` package |
| `packages/server` | local Hono API for the Web UI |
| `packages/ui` | React SPA |

## Adding a rule

Add a `Rule` in `packages/core/src/rules/`, register it in `rules/index.ts`,
add its clinical card in `packages/clinical/src/catalog.ts`, and add a fixture
test.
