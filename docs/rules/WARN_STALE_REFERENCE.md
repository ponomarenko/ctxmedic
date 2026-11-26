# WARN_STALE_REFERENCE

Paths and scripts named in instructions must exist.

| | |
|---|---|
| Diagnosis | Phantom Limb |
| Type | `problem` |
| Default severity | warning |
| Auto-fix | no |
| Data source | configs |

## Why

Instructions drift: a file is moved, a script is renamed, and the instruction still names the old one. The agent then wastes turns looking for it, or follows advice about code that is gone. Whether a path exists is a fact of the file system, so this check is cheap and exact.

The rule reads project instruction, rule and skill files (not global ones in your home folder: they name paths of many projects). It reports one finding per reference, with its line, so `ctxmedic-disable-next-line` can silence one of them.

What counts as a reference:
- inline code that looks like a path with a folder in it (`` `src/api.ts` ``, `` `docs/guides/` ``). Bare names (`` `schema.ts` ``, `` `rules/` ``) are skipped: prose uses them for files of whatever package it is talking about;
- Markdown link targets (`[guide](docs/guide.md)`);
- Claude Code imports on their own line (`@docs/extra.md`);
- `npm run X`, `pnpm run X` and `yarn run X` anywhere, code blocks included, checked against the `scripts` of the root `package.json`.

A path counts as existing when it resolves from the project root, from the folder of the file that names it, or from any top-level folder (monorepos shorten `packages/core/src/x.ts` to `core/src/x.ts`). Skipped: URLs and anything with `:`, absolute and `~/` paths, globs, placeholders (`<name>`, `path/to/...`, `...`), scoped npm packages (`@scope/pkg`), and paths inside fenced code blocks (mostly examples).

## Examples

Bad:

```markdown
Shared helpers live in `src/legacy/api.ts`.
Run `pnpm run lint:all` before you push.
```

(`src/legacy/api.ts` was moved; `package.json` has `lint`, not `lint:all`.)

Good:

```markdown
Shared helpers live in `src/api/client.ts`.
Run `pnpm run lint` before you push.
```

## Options

| Option | Type | Default | Meaning |
|---|---|---|---|
| `allow` | array of globs | `["node_modules/**", "dist/**", "build/**", "coverage/**", "out/**"]` | References that are never checked, such as build output that may not exist yet. Your list replaces the default. |
| `commands` | boolean | `true` | Check `npm`/`pnpm`/`yarn run` scripts against `package.json`. |

```json
{ "rules": { "WARN_STALE_REFERENCE": ["on", { "allow": ["generated/**"], "commands": false }] } }
```

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "WARN_STALE_REFERENCE": "off" } }
```

For one reference, on the line before it:

```markdown
<!-- ctxmedic-disable-next-line WARN_STALE_REFERENCE -- created by the setup script -->
```

See [Configuring rules](README.md) for levels, options and `ignores`.
