# FIN_CACHE_MISS

Keep the prompt cache warm.

| | |
|---|---|
| Diagnosis | Prompt Cache Thrashing |
| Type | `suggestion` |
| Default severity | warning from $1/month of waste, info below |
| Auto-fix | no |
| Data source | session logs |

## Why

Cached input costs about a tenth of fresh input. A harness with at least 1M input tokens and a cache hit ratio below 40% is paying full price for context the provider could serve from cache.

## Examples

Bad:

Instructions that start with today's date or the current branch name, so the prefix changes on every session.

Good:

Static instructions at the top; dynamic data later or not at all; no model switches mid-session.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `minHitRatio` | number 0–1 | `0.4` | Cache hit ratio below which the rule fires. |
| `targetHitRatio` | number 0–1 | `0.7` | The ratio the savings estimate assumes you can reach; at least `minHitRatio`. |
| `minTokens` | positive integer | `1000000` | Input tokens a harness needs before its ratio is judged. |

```json
{ "rules": { "FIN_CACHE_MISS": ["on", { "minHitRatio": 0.5 }] } }
```

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "FIN_CACHE_MISS": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable FIN_CACHE_MISS -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
