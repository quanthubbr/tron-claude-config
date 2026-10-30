---
paths:
  - "**/*.ets"
  - "**/*.ts"
  - "**/ohosTest/**"
---
# HarmonyOS / ArkTS Testing

> Builds on the shared rules in `../common/testing.md`.

## Layout

Production under `src/main/ets/`; tests under `src/ohosTest/ets/test/` with `TestRunner` entry.

## Run

```bash
hvigorw testHap -p product=default
```

Device UI tests via `@ohos.UiTest` + Hypium on hardware/emulator when required.

## Unit style

Hypium `describe`/`it`/`expect` on ViewModels and services — assert initial state, mutations, empty/error inputs.

## TDD loop

Red test in ohosTest → minimal main code → refactor → `hvigorw assembleHap` → device/emulator verify.

## Coverage targets

~80% on ViewModels, services, utilities; integration for API/DB; UI tests for login/navigation/submit flows; include permission denial and empty/network failure cases.

## Practice

Independent tests; mock network/system APIs in unit layer; name `should_<behavior>_when_<condition>`; assert `@Trace` updates and `NavPathStack` flows without testing framework internals.

Workflow: `techne:quality` skill.
