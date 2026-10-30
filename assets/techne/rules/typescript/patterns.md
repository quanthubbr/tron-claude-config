---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
> Builds on the shared rules in `../common/patterns.md`.

# TypeScript patterns

Typed API envelope (`success`, `data`, `error`, optional `meta`). Generic repository interface for persistence. Shared hooks (debounce, etc.) colocated under `hooks/`.
