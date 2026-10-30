---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
> Builds on the shared rules in `../common/security.md`.

# TypeScript security

Read secrets from `process.env`; throw at startup if missing. Never embed keys in source.

Use **exo-security** / `security-review` for audits.
