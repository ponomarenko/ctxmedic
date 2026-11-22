# ERR_INVALID_SKILL

Skills need valid frontmatter, a unique name and a description with a trigger.

| | |
|---|---|
| Diagnosis | Skill Amnesia |
| Type | `problem` |
| Default severity | warning; info for a weak trigger |
| Auto-fix | no |
| Data source | configs |

## Why

Harnesses discover skills by their YAML frontmatter and decide when to load them from `description`. A skill without frontmatter, with a bad or duplicate `name`, or with a description that never says when to use it, costs tokens and never helps.

## Examples

Bad:

```markdown
---
name: SQL Helper
description: SQL stuff
---
```

Good:

```markdown
---
name: sql-format
description: Formats SQL. Use when the user asks to format or lint SQL queries.
---
```

## Options

None.

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "ERR_INVALID_SKILL": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable ERR_INVALID_SKILL -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
