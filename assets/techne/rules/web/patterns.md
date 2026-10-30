---
paths:
  - "**/*.css"
  - "**/*.scss"
  - "**/*.sass"
  - "**/*.less"
  - "**/*.html"
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
---
> Builds on the shared rules in `../common/patterns.md`.

# Web patterns

Compound components + context for complex widgets. Container/presentational split: data vs pure UI.

State: server cache (TanStack Query/SWR), client store only for UI, URL for filters/tabs/pagination, form library for forms — no duplicated server cache in client stores.

Stale-while-revalidate and optimistic updates with rollback UX. Parallel fetches; avoid request waterfalls.

See **techne:web** for Vite/SEO depth.
