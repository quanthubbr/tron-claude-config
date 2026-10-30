---
paths:
  - "**/*.vue"
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/hooks.md`.

# Vue harness hooks

After edits: eslint (vue plugin) + Prettier per file; debounced project `vue-tsc --noEmit` (not plain `tsc` for SFCs).

Optional boundary lint (FSD/steiger). `EXONOUS_HOOK_PROFILE`, `EXONOUS_DISABLED_HOOKS`.
