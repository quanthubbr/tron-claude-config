---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> Builds on the shared rules in `../common/hooks.md`.

# Web hooks

Wire hooks to the repo package manager (`pnpm`/`yarn`/`npm exec`) — never remote one-off runners.

## PostToolUse (Write|Edit)

1. Format (`prettier --write "$FILE_PATH"`)
2. Lint (`eslint --fix "$FILE_PATH"`)
3. Typecheck (project): `timeout 60 pnpm tsc --noEmit --incremental --tsBuildInfoFile node_modules/.cache/tsc-hook.tsbuildinfo`

Without `--incremental` + cache path, rapid edits stack concurrent `tsc` processes. Without `timeout`, hung checks orphan shells.

Optional: `stylelint --fix` on stylesheets.

## PreToolUse

Reject Write tool payloads over ~800 lines — split modules instead.

## Stop

Run production `build` when the session touched bundler config or shared components.

## Controls

`EXONOUS_HOOK_PROFILE`, `EXONOUS_DISABLED_HOOKS`.
