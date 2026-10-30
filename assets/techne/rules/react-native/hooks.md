---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/hooks.md`.

# React Native harness hooks

PostToolUse on TS/TSX: `tsc --noEmit`, `expo lint`, Prettier on touched files.

Periodic: `expo-doctor`, `expo install --check`, dependency audit.

No full native builds per edit — reserve EAS/E2E for CI/commands.

`EXONOUS_HOOK_PROFILE`, `EXONOUS_DISABLED_HOOKS`.
