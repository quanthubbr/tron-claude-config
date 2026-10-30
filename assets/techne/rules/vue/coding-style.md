---
paths:
  - "**/*.vue"
---
> Builds on the shared rules in `../common/coding-style.md`.

# Vue coding style

`<script setup lang="ts">` only for new work. Order: script, template, scoped style. PascalCase SFC names; `use*` composables.

`ref` primary; `.value` in script; no destructuring reactive/Pinia without `toRefs`/`storeToRefs`.

Pure `computed`; lazy `watch` with getters; `watchEffect` stops tracking after first `await`.

Lifecycle registered synchronously in setup; cleanup on unmount; DOM reads after `nextTick`.

Macros: typed props/emits; `defineModel` for v-model; stable `:key` on `v-for` (never index); never `v-if` + `v-for` same element.

**techne:vue** skill for depth.
