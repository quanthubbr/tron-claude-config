---
paths:
  - "**/*.ets"
  - "**/*.ts"
  - "**/module.json5"
  - "**/oh-package.json5"
---
# HarmonyOS / ArkTS Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS` — async hvigor/ohpm steps usually `standard` or `strict` only.

## Build

```bash
hvigorw assembleHap -p product=default
hvigorw clean
ohpm install
```

## PostToolUse (standard/strict)

After `.ets`/`.ts` edits: `hvigorw assembleHap -p product=default` (surface last errors).

After `module.json5`: verify permissions/abilities.

After `oh-package.json5`: `ohpm install`.

## Guard

Warn on V1 state decorators (`@State`, `@Prop`, `@Link`, …) — use **V2** (`@ComponentV2`, `@Local`, `@Param`, …).

## Checklist

- HAP builds clean
- No `@ohos.router` in new code — use `Navigation` + `NavPathStack`
- Permissions declared; deps in oh-package; i18n strings + dark theme colors for new resources
