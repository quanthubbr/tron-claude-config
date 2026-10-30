---
name: vue
description: Vue 3 Composition API, Pinia, Vue Router, Nuxt 4 SSR/hydration, and screenshot-to-Vue conversion flows. Use for `.vue` SFCs, composables, Nuxt data fetching, route rules, or batch UI imports (Vant, Element Plus, Ant Design Vue).
---

Vue 3 with `<script setup>`: feature-oriented folders, composables over mixins, Pinia for shared state, and Nuxt-aware SSR. **techne:web** covers Vite/Bun/SEO shared ground; **ui-design** for a11y polish; **biblos** for API details; **techne:quality** for Playwright E2E.

## Non-negotiable rules

1. **`<script setup lang="ts">` for new code** — ordered blocks: imports → props/emits → composables → state → computed → methods → watchers → lifecycle.
2. **Composables start with `use`**, accept `MaybeRef` inputs, return refs/computed, and tear down in `onUnmounted` / watcher cleanup.
3. **Never mutate props** — emit events or use `defineModel()` / `v-model`.
4. **Stable `:key` on `v-for`** — entity ids, not array index; filter lists in computed, not `v-if` + `v-for` on one node.
5. **Pinia setup stores** — async actions expose loading/error; prefer actions over scattered `$patch` for business rules.
6. **Lazy routes** via dynamic `import()` for non-critical pages; `v-show` for frequent toggles, `v-if` for rare mounts.
7. **Nuxt: `await useFetch` / `useAsyncData` for SSR page data** — not bare top-level `$fetch`; stable cache keys; side-effect-free fetch handlers.
8. **Hydration-safe first paint** — no `Date.now()`, random, or `localStorage` in SSR templates; use `ClientOnly`, `.client.vue`, or `onMounted`.
9. **Use `useRoute()` from Nuxt in Nuxt apps** — not vue-router's import; avoid `route.fullPath` driving SSR markup (fragments are client-only).
10. **`routeRules` per segment** — prerender marketing, SWR/ISR catalogs, `ssr: false` only for true client-only areas.
11. **Sanitize before `v-html`** — user HTML is XSS risk; prefer text bindings.
12. **Screenshot conversion sends images to external APIs** — get permission, pin tool version, never commit keys or customer assets; review generated code before merge.

## References

| File | Load when |
|------|-----------|
| [reference/vue-patterns.md](reference/vue-patterns.md) | Project layout, SFC architecture, Pinia, router, Vue 3.5 APIs, testing |
| [reference/nuxt4-patterns.md](reference/nuxt4-patterns.md) | Hydration, `useFetch`, route rules, lazy components and hydration |
| [reference/ui-to-vue.md](reference/ui-to-vue.md) | Batch design screenshot → Vue with component libraries |
