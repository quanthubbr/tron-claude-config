---
paths:
  - "**/*.pl"
  - "**/*.pm"
  - "**/*.t"
  - "**/*.psgi"
  - "**/*.cgi"
---
# Perl Security

> Builds on the shared rules in `../common/security.md`.

## Taint

`-T` on internet-facing scripts; sanitize `%ENV` before external commands.

## Input

Allowlist capture groups — never `/(.*)/s` untaint.

## Files

Three-arg `open`; **Cwd::realpath** + prefix check against allowed roots.

## Processes

List-form `system(@args)`; **IPC::Run3** for captured output; no backticks with interpolation.

## SQL

Placeholders only.

## Scan

```bash
perlcritic --severity 4 --theme security lib/
```

Review: `security-review` skill / `exo-security` agent.
