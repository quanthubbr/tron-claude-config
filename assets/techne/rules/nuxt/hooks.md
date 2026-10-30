---
paths:
  - "**/nuxt.config.*"
  - "**/app.config.*"
  - "**/server/**/*.ts"
  - "**/*.vue"
---
> Builds on the shared rules in `../common/hooks.md`.

# Nuxt harness hooks

Debounced `nuxi typecheck` with timeout after eslint --fix on `app/**` and `server/**`. Prefer `@nuxt/eslint` module.

Single formatting authority (Prettier or ESLint stylistic — not both fighting).

`EXONOUS_HOOK_PROFILE`, `EXONOUS_DISABLED_HOOKS`.
