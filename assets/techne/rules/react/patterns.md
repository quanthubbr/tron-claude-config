---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/components/**/*.js"
  - "**/app/**/*.tsx"
  - "**/pages/**/*.tsx"
---
> Extends [typescript/patterns.md](../typescript/patterns.md).

# React patterns

## Smart vs presentational

Containers fetch and orchestrate; leaf components render from props without service calls.

## Where state lives

1. Single component → local `useState`
2. Parent + nearby children → lift + props
3. Rare, low-churn cross-tree reads → Context (theme, locale)
4. Frequent shared updates → Zustand/Jotai/RTK
5. Remote data → TanStack Query/SWR/RSC fetch — avoid naked `fetch` in `useEffect`

## RSC (App Router)

Server Components default; add `"use client"` only for state/effects/events/browser APIs. Pass serializable props down; slot Server output through `children`. Mark secret modules with `server-only`.

Pair `<Suspense fallback=…>` with an Error Boundary near the async subtree — not only at the route root.

## Forms

Submit-driven flows: uncontrolled fields + server action reading `FormData`. Live validation or cross-field rules: controlled fields or React Hook Form / TanStack Form.

## Lists

Stable `key` from entity id — not array index when rows reorder. Composition: `children`, render props, compound components with shared context (tabs/menus).

## Portals

Modals/toasts via portal to escape overflow/z-index traps.

## Refs

React 19: `ref` prop on function components; React 18: `forwardRef`.

Load **techne:react** for Next.js/Turbopack specifics.
