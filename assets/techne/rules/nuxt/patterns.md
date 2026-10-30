---
paths:
  - "**/nuxt.config.*"
  - "**/app.config.*"
  - "**/app.vue"
  - "**/server/**/*.ts"
  - "**/pages/**"
  - "**/middleware/**"
---
> Builds on the shared rules in `../common/patterns.md`.

# Nuxt patterns

## Fetch timing

| API | Use |
|-----|-----|
| `useFetch(url)` | SSR-first page data; deduped via payload |
| `useAsyncData(key, fn)` | Custom async (SDK/GraphQL) with shared cache key |
| `$fetch` | Client-only interactions (POST/PUT after click) |

Using `$fetch` for initial render causes double fetch + hydration mismatch.

## Shared state

`useState('key', init)` for cross-component SSR-safe state — values must JSON-serialize.

Never export a module-level `ref()` singleton (leaks across concurrent SSR requests).

Pinia for domain state; `useState` for small shared primitives. Async init: `callOnce`, not hidden inside fetch callbacks.

## Server (Nitro)

Files under `server/api` map to routes automatically. Throw errors with `createError({ status, statusText })`.

Server middleware may mutate `event.context` but must not send a body response.

## Route middleware

`defineNuxtRouteMiddleware((to, from) => …)` — use parameters, not `useRoute()` inside middleware. `.global.ts` suffix runs everywhere.

## Hydration

Branch UI on fetch `status`. Payload serialization uses `devalue` — plain API JSON may need custom serializers.

Trim payload with `pick` / `transform` on large objects.
