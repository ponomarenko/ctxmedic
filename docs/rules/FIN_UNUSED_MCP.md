# FIN_UNUSED_MCP

Remove MCP servers that are never called.

| | |
|---|---|
| Diagnosis | Toxic MCP Syndrome |
| Type | `suggestion` |
| Default severity | warning from $1/month of waste, info below |
| Auto-fix | no |
| Data source | session logs |

## Why

Every configured MCP server adds its tool definitions to every request. A server nobody called during the analyzed period is pure cost. Schema sizes are measured from the logs when possible (ADR-018).

## Examples

Bad:

A global `~/.claude.json` with five MCP servers, two of them called 0 times in 30 days.

Good:

Servers live in the project-level config of the projects that use them.

## Options

None yet: the thresholds are constants in `packages/finops/src/detectors.ts` (see the roadmap).

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "FIN_UNUSED_MCP": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable FIN_UNUSED_MCP -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
