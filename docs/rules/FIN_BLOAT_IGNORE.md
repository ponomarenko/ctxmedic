# FIN_BLOAT_IGNORE

Keep build output and lockfiles out of the AI index with an ignore file.

| | |
|---|---|
| Diagnosis | Indexing Bloat |
| Type | `suggestion` |
| Default severity | warning |
| Auto-fix | yes: writes the ignore file |
| Data source | configs |

## Why

Cursor and Windsurf index the project for retrieval. Without `.cursorignore` / `.codeiumignore`, `node_modules/`, `dist/` and lockfiles fill search results and burn tokens.

## Examples

Bad:

A project with `node_modules/` and `pnpm-lock.yaml`, used with Cursor, and no `.cursorignore`.

Good:

`.cursorignore` lists build output and lockfiles.

## Options

None.

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "FIN_BLOAT_IGNORE": "off" } }
```

For one file, anywhere in a Markdown file the finding points at:

```markdown
<!-- ctxmedic-disable FIN_BLOAT_IGNORE -- reason -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
