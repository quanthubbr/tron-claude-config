---
paths:
  - "**/*.component.ts"
  - "**/*.component.html"
  - "**/*.service.ts"
  - "**/*.directive.ts"
  - "**/*.pipe.ts"
  - "**/*.spec.ts"
---
> Builds on the shared rules in `../common/hooks.md`.

# Angular harness hooks

PostToolUse on TS/HTML edits:

- Prettier on touched files
- `ng lint` (or eslint angular config)
- `tsc --noEmit` for quick type feedback
- `ng build` after codegen-sized changes (templates + types)

Stop hook: lint sweep on modified paths.

Tune aggressiveness with `EXONOUS_HOOK_PROFILE` and disable specific ids via `EXONOUS_DISABLED_HOOKS`.
