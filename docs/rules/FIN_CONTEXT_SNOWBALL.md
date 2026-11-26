# FIN_CONTEXT_SNOWBALL

Compact or clear long sessions.

| | |
|---|---|
| Diagnosis | Context Snowball |
| Type | `suggestion` |
| Default severity | warning from $1/month of waste, info below |
| Auto-fix | no |
| Data source | session logs |

## Why

Each step re-reads the whole history. A session with more than 35 steps, at least 10 of them with 100k+ context, and no `/compact` or `/clear` pays for that history again and again, and quality drops as it grows.

## Examples

Bad:

A 120-step session that changed tasks three times without `/clear`.

Good:

`/compact` at task milestones, `/clear` between unrelated tasks, auto-compact on.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `steps` | positive integer | `35` | A session longer than this many steps can snowball. |
| `heavySteps` | positive integer | `10` | How many of its steps must carry 100k+ context. |

```json
{ "rules": { "FIN_CONTEXT_SNOWBALL": ["on", { "steps": 60 }] } }
```

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "FIN_CONTEXT_SNOWBALL": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable FIN_CONTEXT_SNOWBALL -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
