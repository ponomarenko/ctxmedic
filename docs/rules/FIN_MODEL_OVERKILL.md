# FIN_MODEL_OVERKILL

Route one-shot tasks to a cheaper model.

| | |
|---|---|
| Diagnosis | Model Overkill |
| Type | `suggestion` |
| Default severity | warning from $1/month of waste, info below |
| Auto-fix | no |
| Data source | session logs |

## Why

Sessions of one or two steps rarely need a frontier model. When at least three such sessions ran on an expensive model, a cheaper one would have handled them.

## Examples

Bad:

Dozens of one-step sessions on the most expensive model.

Good:

Skills and subagents for routine tasks set `model:` in their frontmatter.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `maxSteps` | positive integer | `2` | A session with at most this many steps counts as a one-shot task. |
| `minSessions` | positive integer | `3` | How many one-shot sessions on one expensive model it takes to report it. |

```json
{ "rules": { "FIN_MODEL_OVERKILL": ["on", { "maxSteps": 3, "minSessions": 5 }] } }
```

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "FIN_MODEL_OVERKILL": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable FIN_MODEL_OVERKILL -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
