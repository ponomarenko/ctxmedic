# WARN_DUPLICATE_RULES

Do not keep near-identical instruction files for different harnesses.

| | |
|---|---|
| Diagnosis | Instruction Duplication Syndrome |
| Type | `suggestion` |
| Default severity | warning |
| Auto-fix | yes: merge into `.ai/INSTRUCTIONS.md` and symlink both files to it |
| Data source | configs |

## Why

`CLAUDE.md`, `AGENTS.md` and `.cursorrules` often start as copies. They drift apart, and each agent gets a different set of orders. Similarity is the Jaccard index of normalized lines (ADR-010).

## Examples

Bad:

`CLAUDE.md` and `AGENTS.md` share 90% of their lines, edited separately.

Good:

One canonical `.ai/INSTRUCTIONS.md`; `CLAUDE.md` and `AGENTS.md` are relative symlinks to it.

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `similarity` | number between 0 and 1 | `0.75` | Line similarity above which two files count as duplicates. |

```json
{ "rules": { "WARN_DUPLICATE_RULES": ["on", { "similarity": 0.9 }] } }
```

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "WARN_DUPLICATE_RULES": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable WARN_DUPLICATE_RULES -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
