# Frontend architecture (cross-framework)

## Composition

Prefer small leaf components combined via `children` or named slots instead of deep inheritance.

**Compound widgets** (tabs, menus): hold shared state in a parent provider/context; children read it and throw if used outside the tree.

**Render-prop / loader child**: parent owns fetch lifecycle; child function receives `{ data, loading, error }`. In React, a dedicated data hook is often simpler.

## Reusable logic

Extract when the same sequence appears twice:

- **Toggle**: boolean state + stable flip callback.
- **Debounced value**: delay updates to downstream search/API calls (typical 300–500ms).
- **Query helper**: keep fetcher in a ref so `refetch` stays stable; gate initial run with an `enabled` flag to avoid effect loops when callers pass inline functions.

## State placement

| Situation | Approach |
|-----------|----------|
| Single widget | Local state |
| Parent + few children | Lift to nearest ancestor |
| Rare global reads (theme, locale) | Context |
| Frequent cross-tree updates | External store (Zustand, etc.) |
| Remote authoritative data | Server cache library or SSR fetch |

Context + reducer suits medium-complexity domains with explicit action types.

## Performance

- Memoize sorts/filters on large arrays; copy before sort (in-place sort mutates).
- Lazy-load heavy charts/3D with a suspense/fallback boundary.
- Virtualize long lists (`@tanstack/react-virtual` or equivalent) with estimated row height + modest overscan.

## Forms

Controlled fields with inline validation before submit; for multi-step or field arrays use a form library (React Hook Form, TanStack Form, etc.) instead of hand-rolled state.

## Resilience

Class or library error boundary around route sections; reset UI on retry; log in `componentDidCatch` equivalent.

## Motion

List enter/exit via animation library; modals: overlay + content transitions; respect `prefers-reduced-motion` when adding motion (see **ui-design**).

## Accessibility basics

- Combobox/listbox: arrow keys, Enter, Escape; set `aria-expanded` / `role`.
- Modals: `role="dialog"`, `aria-modal`, trap focus on open, restore focus on close.

Deep WCAG review → **ui-design** `audit` / `harden`.
