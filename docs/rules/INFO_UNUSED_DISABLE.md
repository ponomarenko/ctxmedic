# INFO_UNUSED_DISABLE

Remove ctxmedic-disable comments that silence nothing.

| | |
|---|---|
| Diagnosis | Phantom Prescription |
| Type | `suggestion` |
| Default severity | info |
| Auto-fix | no |
| Data source | configs |

## Why

A disable comment that no longer matches a finding is stale: the problem it hid was fixed, the rule was turned off, or the line moved. Left in place, it silences the next real problem in that file or on that line without anyone noticing. Like ESLint's `--report-unused-disable-directives`, ctxmedic reports every such comment with its line.

A comment counts as unused when no finding needed it after levels and `ignores` were applied, so a comment for a rule that is `"off"` in `ctxmedic.config.json` is unused too. `FIN_*` detectors that read session logs never report Markdown files, so a comment naming them is always unused.

## Examples

Bad:

```markdown
<!-- ctxmedic-disable-next-line INFO_UNSUPPORTED_SYNTAX -->
Plain text that no rule complains about.
```

Good:

Delete the comment, or keep it only where a finding still needs silencing.

## Options

None.

## How to disable

For the whole project, in `ctxmedic.config.json`:

```json
{ "rules": { "INFO_UNUSED_DISABLE": "off" } }
```

See [Configuring rules](README.md) for levels, options and `ignores`.
