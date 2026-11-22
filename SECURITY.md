# Security Policy

ctxmedic is local-first. It never sends prompts, logs, configs, or secrets off
your machine. The only network calls are:

- `ctxmedic consult --ai`, which you call explicitly, to a local Ollama server
  or to the Anthropic/OpenAI API with your own key;
- `ctxmedic ui`, which listens on `127.0.0.1` only and requires a one-time
  session token for write actions.

## Reporting a vulnerability

Do **not** open a public issue. Use GitHub private vulnerability reporting:
https://github.com/ponomarenko/ctxmedic/security/advisories/new

You will get an answer within 7 days. Please include the version, the steps to
reproduce, and the impact.

## Supported versions

Only the latest minor release gets security fixes.
