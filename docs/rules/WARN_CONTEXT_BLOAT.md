# WARN_CONTEXT_BLOAT

Limit the tokens a harness loads at session start.

| | |
|---|---|
| Diagnosis | Context Obesity |
| Type | `suggestion` |
| Default severity | warning; critical above 3× the threshold |
| Auto-fix | no |
| Data source | configs |

## Why

Everything a harness loads at startup rides along with every request. Long always-on instructions cost money on every turn, and rules in the middle of a long prompt get less attention.

## Examples

Bad:

A 9,000-token `CLAUDE.md` that holds the deploy runbook, the full API reference and the coding style.

Good:

A short always-on core; rarely needed sections move into skills or path-scoped rules that load on demand.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `tokens` | positive integer | `3500` | Startup tokens per harness above which the rule fires. Above 3× this value the finding is critical. |

```json
{ "rules": { "WARN_CONTEXT_BLOAT": ["on", { "tokens": 6000 }] } }
```

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "WARN_CONTEXT_BLOAT": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable WARN_CONTEXT_BLOAT -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
