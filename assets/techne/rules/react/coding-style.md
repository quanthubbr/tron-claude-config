---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/components/**/*.js"
  - "**/hooks/**/*.ts"
  - "**/hooks/**/*.js"
---
> Extends [typescript/coding-style.md](../typescript/coding-style.md).

# React coding style

`.tsx` for JSX; `.ts` for logic/hooks/types. PascalCase components/files; `use*` hooks; `handle*` handlers vs `on*` props; boolean props prefixed (`isLoading`).

Destructure props in signature. Minimal JSX logic — precompute above `return`. Fragments over wrapper divs.

Next App Router: Server Components default; `"use client"` only when needed on line 1; never pull server-only modules into client graphs.

Imports: React → vendors → aliases → relatives; `import type` when split.

State: local first; context for low-churn globals; external store for high-frequency shared state; derive don't duplicate.

No new class components. Colocate tests; **techne:react** for depth.
