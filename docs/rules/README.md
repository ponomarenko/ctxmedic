# Rules

Every finding comes from a rule. Each rule has a page with its reasons,
examples, options and how to turn it off, in the spirit of ESLint's rule docs.
Rules with `FIN_` read your local session logs; the others read config files.

| Rule | Checks | Type | Auto-fix | Options |
|---|---|---|---|---|
| [`ERR_BROKEN_LINK`](ERR_BROKEN_LINK.md) | Symlinked configs must point to an existing target, without loops or absolute paths | `problem` | ✔ |  |
| [`WARN_CONTEXT_BLOAT`](WARN_CONTEXT_BLOAT.md) | Limit the tokens a harness loads at session start | `suggestion` |  | ✔ |
| [`WARN_DUPLICATE_RULES`](WARN_DUPLICATE_RULES.md) | Do not keep near-identical instruction files for different harnesses | `suggestion` | ✔ | ✔ |
| [`ERR_INVALID_SKILL`](ERR_INVALID_SKILL.md) | Skills need valid frontmatter, a unique name and a description with a trigger | `problem` |  |  |
| [`CRIT_SECRET_LEAK`](CRIT_SECRET_LEAK.md) | Do not store secrets in plain text in AI configs | `problem` |  |  |
| [`INFO_UNSUPPORTED_SYNTAX`](INFO_UNSUPPORTED_SYNTAX.md) | Flag directives a harness does not understand | `suggestion` |  |  |
| [`FIN_BLOAT_IGNORE`](FIN_BLOAT_IGNORE.md) | Keep build output and lockfiles out of the AI index with an ignore file | `suggestion` | ✔ |  |
| [`FIN_UNUSED_MCP`](FIN_UNUSED_MCP.md) | Remove MCP servers that are never called | `suggestion` |  |  |
| [`FIN_MODEL_OVERKILL`](FIN_MODEL_OVERKILL.md) | Route one-shot tasks to a cheaper model | `suggestion` |  |  |
| [`FIN_CONTEXT_SNOWBALL`](FIN_CONTEXT_SNOWBALL.md) | Compact or clear long sessions | `suggestion` |  |  |
| [`FIN_CACHE_MISS`](FIN_CACHE_MISS.md) | Keep the prompt cache warm | `suggestion` |  |  |

## Configuring rules

Put `ctxmedic.config.json` in the project root (the folder you pass to
`ctxmedic checkup`):

```json
{
  "rules": {
    "INFO_UNSUPPORTED_SYNTAX": "off",
    "ERR_INVALID_SKILL": "critical",
    "WARN_CONTEXT_BLOAT": ["on", { "tokens": 6000 }]
  },
  "ignores": ["docs/legacy/**", "~/.claude/skills/experimental/**"]
}
```

### Levels

| Level | Effect |
|---|---|
| `"off"` | The rule does not run and its findings are dropped. |
| `"on"` | The rule runs with the severity it picks itself (the default). |
| `"critical"`, `"warning"`, `"info"` | Every finding of the rule gets this severity. `checkup` exits with code 1 on critical findings, so this is how you make a rule gate CI. |

An entry is a level, or `[level, options]` for rules that take options. Unknown
rule ids, unknown levels and invalid options stop the run with an error that
names the problem; ctxmedic never falls back to defaults silently.

### `ignores`

Globs ([picomatch](https://github.com/micromatch/picomatch) syntax) over the
paths that findings report: project-relative, or starting with `~/` for global
files. A finding is dropped only when every file it reports matches. Findings
without files (most `FIN_` findings) are never ignored this way; turn the rule
off instead.

### Inline disable comments

Inside a Markdown file (instructions, rules, skills):

```markdown
<!-- ctxmedic-disable WARN_CONTEXT_BLOAT, INFO_UNSUPPORTED_SYNTAX -- long on purpose -->
<!-- ctxmedic-disable -->   (every rule)
```

The comment silences matching findings that report this file, wherever the
comment sits in the file. Everything after `--` is a free-text reason.
JSON files cannot carry comments; use `ignores` for them.

### Health Score and history

Turned-off and ignored findings do not count toward the Health Score. The trend
compares only visits made with the same config (ADR-017, ADR-020), so changing
the config starts a new trend instead of showing a fake improvement.
