# Nuxt 4 SSR & routing

Build/debug Nuxt 4 with hybrid rendering, payload discipline, and hydration-safe UI.

## Hydration safety

First server and client render must match.

- No `Date.now()`, `Math.random()`, `window`, or storage reads in SSR template state.
- Defer browser-only work: `onMounted`, `import.meta.client`, `<ClientOnly>`, `*.client.vue`.
- In Nuxt apps use **`useRoute()` from `#app`**, not a direct `vue-router` import.
- Do not drive SSR markup from `route.fullPath` (hash is client-only).
- `ssr: false` route rule is last resort for truly client-only surfaces—not a default mismatch fix.

## Data fetching

| API | When |
|-----|------|
| `await useFetch(url)` | Standard SSR read; hydrates from payload |
| `await useAsyncData(key, fn)` | Custom fetcher, composed sources, explicit cache key |
| `$fetch` in handlers | User actions, mutations, client-only reads |
| `lazy: true` / `useLazyFetch` | Non-blocking; show `pending` UI |
| `server: false` | Data not needed for SEO/first paint |

Handlers must be side-effect free (run on server + hydration). Trim payload with `pick`; avoid deep reactivity when unnecessary.

```typescript
const route = useRoute()

const { data: article, status, refresh } = await useAsyncData(
  () => `article:${route.params.slug}`,
  () => $fetch(`/api/articles/${route.params.slug}`),
)

const { data: comments } = await useFetch(
  `/api/articles/${route.params.slug}/comments`,
  { lazy: true, server: false },
)
```

## routeRules

Configure in `nuxt.config.ts` by path pattern:

```typescript
export default defineNuxtConfig({
  routeRules: {
    '/': { prerender: true },
    '/products/**': { swr: 3600 },
    '/blog/**': { isr: true },
    '/admin/**': { ssr: false },
    '/api/**': { cache: { maxAge: 3600 } },
  },
})
```

| Rule | Effect |
|------|--------|
| `prerender` | Static HTML at build |
| `swr` | Stale-while-revalidate |
| `isr` | Platform incremental static regen |
| `ssr: false` | SPA render for route |
| `cache` / `redirect` | Nitro response behavior |

Tune per section (marketing vs app vs API)—not one global mode.

## Lazy loading & perf

- Pages already code-split by route—keep routes meaningful.
- Prefix `Lazy` on components for dynamic import; gate with `v-if` so chunk loads only when needed.
- Below-fold interactivity: `hydrate-on-visible` or `defineLazyHydrationComponent`.
- New props to a lazy-hydrated component force immediate hydration.
- Internal nav: `<NuxtLink>` for prefetch of route + payload.

Example:

```vue
<template>
  <LazyRecommendations v-if="openRecs" />
  <LazyProductGallery hydrate-on-visible />
</template>
```

## Review checklist

- [ ] SSR and client HTML align on first paint
- [ ] Page data via `useFetch` / `useAsyncData`, not top-level `$fetch`
- [ ] Lazy fetches show loading states
- [ ] `routeRules` match SEO/freshness needs
- [ ] Heavy islands lazy-loaded or lazy-hydrated
