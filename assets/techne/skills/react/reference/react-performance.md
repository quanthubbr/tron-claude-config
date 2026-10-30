# React / Next.js performance

Prioritized checklist for reviews. When React Compiler ships in project, treat manual memo rules as secondary.

## Priority map

| P | Area | Trigger |
|---|------|---------|
| 1 | Async waterfalls | Sequential independent `await` |
| 2 | Bundle size | First-load JS, heavy imports |
| 3 | Server (RSC, actions) | SSR data paths, serialization |
| 4 | Client fetching | Shared remote state in hooks |
| 5 | Re-renders | Store subscriptions, prop identity |
| 6 | Rendering | Lists, animation, hydration |
| 7 | JS micro | Hot loops, allocations |
| 8 | Advanced | Effect events, ref indirection |

## 1 — Waterfalls

- Guard with sync checks before first `await`.
- Defer `await` to the branch that needs the result.
- Independent calls: `Promise.all([...])`.
- Start promises early, await late when dependencies differ.
- RSC: split async siblings instead of one sequential parent.

Streaming: tight Suspense boundaries; reserve space to limit CLS.

## 2 — Bundle

- Import from concrete module paths, not `@/components` barrels.
- Next 13.5+: `experimental.optimizePackageImports` for listed packages.
- No dynamic template imports—use explicit branches.
- `next/dynamic` for heavy client-only widgets (`ssr: false` when needed).
- Defer analytics/support with `next/script` `afterInteractive` / `lazyOnload`.
- Preload route chunks on hover/focus when UX warrants.

## 3 — Server

- AuthZ inside Server Actions (same bar as HTTP handlers).
- `React.cache()` dedupes per-request reads.
- Cross-request static data: LRU / `unstable_cache`, not module globals.
- Hoist static file reads to module scope once.
- **No mutable module state** shared across requests.
- Minimize props serialized to client components.
- Nested enrichment: `Promise.all` over items.
- Next 15+: `after()` for logging/analytics post-response.

## 4 — Client data

- TanStack Query / SWR for shared reads—one cache, one flight.
- One global scroll/resize listener via shared hook, not per component.
- `{ passive: true }` on scroll listeners when not preventing default.
- `localStorage`: version field + small payloads (sync blocking).

## 5 — Re-renders

- Read store inside event handler with `.getState()` when render does not need subscription.
- Memoize heavy child; hoist `const EMPTY: T[] = []` for default array props.
- Effect deps: primitives, not fresh object literals.
- Select derived booleans from store (`length > 0`) not whole cart object.
- Derive strings in render, not effect → setState.
- `useState(() => expensiveInit())` for costly initial state.
- Skip memo on trivial primitive math.
- Split hooks with unrelated deps.
- Prefer event handlers over effects for user-driven logic.
- `startTransition` / `useDeferredValue` for non-urgent/filter UI.
- `useRef` for high-frequency non-visual state.
- Never define components inside components.

## 6 — Rendering

- Animate wrapper div, not raw SVG transforms.
- `content-visibility: auto` + intrinsic size for long lists.
- Hoist static JSX fragments.
- Trim SVG path precision.
- Theme/locale before hydration: inline script on `documentElement` when needed.
- `suppressHydrationWarning` only on known leaf mismatches (e.g. live clock).
- React 19 `<Activity mode="hidden">` vs unmount for tabs.
- `{n > 0 ? <Badge /> : null}` not `{n && <Badge />}`.
- `preload` / `preconnect` from `react-dom`.

## 7 — JS micro

Batch DOM class changes; `Map`/`Set` for hot lookups; combine filter+map passes; early returns; hoist RegExp; min/max via loop not sort; `requestIdleCallback` for deferrable work.

## 8 — Advanced

Stable handler via ref + empty-deps callback; `useLatest` helper; do not list `useEffectEvent` values in effect deps.

## Tooling

Next Optimize Package Imports, bundle analyzer, Turbopack dev builds. React Compiler (when enabled) reduces manual memo need.

## Web Vitals mapping

| Metric | Focus |
|--------|--------|
| LCP | Waterfalls, bundle, hints |
| INP | Re-renders, main-thread JS |
| CLS | Suspense placement, media dimensions |
| TBT | Bundle, third-party defer |
