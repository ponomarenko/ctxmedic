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

None yet: the thresholds are constants in `packages/finops/src/detectors.ts` (see the roadmap).

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
