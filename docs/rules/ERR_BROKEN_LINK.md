# ERR_BROKEN_LINK

Symlinked configs must point to an existing target, without loops or absolute paths.

| | |
|---|---|
| Diagnosis | Symlink Necrosis |
| Type | `problem` |
| Default severity | critical (broken or circular), info (absolute) |
| Auto-fix | yes: absolute links become relative |
| Data source | configs |

## Why

A harness that follows a dead or circular symlink loads nothing and says nothing: the agent runs without instructions you believe are active. An absolute link works only on the machine that made it, so teammates and CI lose the file.

## Examples

Bad:

```bash
ln -s ../shared/RULES.md CLAUDE.md   # ../shared/RULES.md was deleted
ln -s /Users/me/ai/AGENTS.md AGENTS.md  # absolute: breaks on every other machine
```

Good:

```bash
ln -s .ai/INSTRUCTIONS.md CLAUDE.md   # relative and the target exists
```

## Options

None.

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "ERR_BROKEN_LINK": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable ERR_BROKEN_LINK -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
