---
paths:
  - "**/*.ets"
  - "**/*.ts"
---
# HarmonyOS / ArkTS Patterns

> Builds on the shared rules in `../common/patterns.md`.

## State V2 only

Use `@ComponentV2`, `@Local`, `@Param`, `@Event`, `@Provider`/`@Consumer`, `@Monitor`, `@Computed`, `@ObservedV2`, `@Trace`. Do **not** use V1 `@State`/`@Prop`/`@Link`/`@Component`.

## Routing

`Navigation` + `NavPathStack` — `pushPath`, `replacePath`, `pop`, `clear`; subpages in `NavDestination`. No legacy router module.

## MVVM layout

```
feature/
  model/       @ObservedV2 data
  viewmodel/   logic
  view/        @ComponentV2 UI
  service/     network/storage
```

`build()` renders only; business rules in ViewModels.

## Lists

`LazyForEach` + stable keys for large lists.

## Animation

State-driven; prefer `transform`/`opacity`; avoid animating layout (`width`/`height`/`padding`/`margin`); `renderGroup(true)` for heavy subtrees.

## Resources

UI strings/colors/sizes via `$r('app.*')` — no magic literals in widgets.

Depth: consult platform docs via `biblos` MCP for API drift.
