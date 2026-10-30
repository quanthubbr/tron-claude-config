---
paths:
  - "**/*.vue"
---
> Builds on the shared rules in `../common/patterns.md`.

# Vue patterns

## Composables

Export `useFeature()` accepting `MaybeRefOrGetter` inputs (`toValue` inside). Return `toRefs(reactiveState)` so callers can destructure safely.

If the composable registers lifecycle hooks or `provide`, call it synchronously from `setup` only.

## State split

Pinia (client/domain) vs `@tanstack/vue-query` (server cache). Keep fetch functions + `queryOptions` factories in an `api/` layer.

Query keys must include reactive refs/computed objects — **not** `.value` snapshots — or refetch breaks.

## Router

Lazy `import()` route components. Global guard checks `meta.requiresAuth`. Watch `() => route.params.id` instead of the whole route object.

## Provide / inject

Use `Symbol` keys typed with `InjectionKey<T>`. Expose readonly state + explicit mutators.

**techne:vue** skill for FSD/Nuxt overlap.
