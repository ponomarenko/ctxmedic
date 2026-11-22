# CRIT_SECRET_LEAK

Do not store secrets in plain text in AI configs.

| | |
|---|---|
| Diagnosis | Credential Hemorrhage |
| Type | `problem` |
| Default severity | critical when the file is in a git repo and not git-ignored, info otherwise |
| Auto-fix | no (rotate the key first) |
| Data source | configs |

## Why

MCP configs and instruction files often carry API keys. A file that is not git-ignored is one `git add .` away from a public leak. Values are always masked in ctxmedic output.

## Examples

Bad:

```json
{ "mcpServers": { "x": { "env": { "ANTHROPIC_API_KEY": "sk-ant-api03-…" } } } }
```

Good:

```json
{ "mcpServers": { "x": { "env": { "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}" } } } }
```

## Options

None.

## How to disable

> [!WARNING]
> Silencing this rule hides a real key from the report. Rotate the key before you turn the rule off for a file.

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "CRIT_SECRET_LEAK": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable CRIT_SECRET_LEAK -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
