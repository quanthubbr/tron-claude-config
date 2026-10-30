---
name: react
description: React 18/19 and Next.js patterns—hooks, RSC boundaries, forms/actions, performance waterfalls, Testing Library/MSW, Turbopack dev. Use when writing or reviewing `.tsx`, App Router data loading, bundle size, or component tests.
---

Idiomatic React trees: pure render logic, clear server/client splits, prioritized performance fixes, and behavior-focused tests. Pair with **atlas** for structure, **biblos** for APIs, **ui-design** for accessibility, **techne:quality** for E2E, and **security-review** / **exo-security** for Server Actions.

## Non-negotiable rules

1. **Render is a function of props and state** — compute derived values inline; do not sync them through effects.
2. **Hooks: top-level only**, with cleanup; use functional updates when the next state depends on the previous.
3. **Do not memoize by default** — add `useMemo`/`useCallback`/`memo` only when profiling or stable child props require it.
4. **Never import a Server Component from a Client file** — pass server output via `children` or serializable props.
5. **Treat every Server Action as a public API** — authenticate and authorize inside the action, not in UI gating alone.
6. **Eliminate async waterfalls first** — cheap sync guards before `await`; parallelize independent work with `Promise.all`; split async server children for parallel RSC fetch.
7. **No `useEffect` + `fetch` for app data** — use TanStack Query, SWR, RSC `fetch`, or event-handler fetches.
8. **Direct imports over barrels** — enable Next.js `optimizePackageImports` where available; dynamic-import heavy client-only UI.
9. **Lists: stable keys and virtualization** when ~50+ non-trivial rows; use ternary conditionals, not `count &&` when `count` may be zero.
10. **Tests assert user-visible behavior** — RTL query priority (role/label), `userEvent`, MSW at the network layer; axe on interactive components.
11. **Next.js 16+ dev defaults to Turbopack** — use root **`proxy.ts`** for edge middleware (not legacy `middleware.ts` on 16+).
12. **No module-level mutable state on the server** — request scope via headers/cookies/`React.cache()` per request.

## References

| File | Load when |
|------|-----------|
| [reference/react-patterns.md](reference/react-patterns.md) | Composition, state placement, RSC, Suspense, forms, data-fetch matrix |
| [reference/react-performance.md](reference/react-performance.md) | Waterfalls, bundles, server/client perf, re-renders, rendering micro-opts |
| [reference/react-testing.md](reference/react-testing.md) | Vitest/Jest, RTL, MSW, hooks, a11y asserts, E2E boundary |
| [reference/nextjs-turbopack.md](reference/nextjs-turbopack.md) | Turbopack dev, webpack fallback, proxy filename, bundle analysis |
