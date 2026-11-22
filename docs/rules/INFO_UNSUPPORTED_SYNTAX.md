# INFO_UNSUPPORTED_SYNTAX

Flag directives a harness does not understand.

| | |
|---|---|
| Diagnosis | Cross-Harness Allergy |
| Type | `suggestion` |
| Default severity | info |
| Auto-fix | no |
| Data source | configs |

## Why

`@import` lines, `alwaysApply`, `globs`, `applyTo` and `trigger` mean something to one tool and are plain text to another. A shared file read by several harnesses sends noise, or wrong instructions, to the ones that ignore them.

## Examples

Bad:

`AGENTS.md` (read by Codex and OpenCode) contains `@docs/extra.md`, which only Claude Code expands.

Good:

Tool-specific directives live in that tool's own file; shared files stay directive-free.

## Options

None.

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "INFO_UNSUPPORTED_SYNTAX": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable INFO_UNSUPPORTED_SYNTAX -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
