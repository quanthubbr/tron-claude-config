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
> Builds on the shared rules in `../common/performance.md`.

# Web performance

Targets: LCP <2.5s, INP <200ms, CLS <0.1. Budgets (~150kb gzip JS landing, ~300kb app — tune per product).

Inline critical CSS when justified; preload hero font/image; defer rest; dynamic-import heavy libs.

Images: dimensions set; lazy below fold; modern formats. Fonts: ≤2 families, `font-display: swap`.

Motion on compositor props only; narrow `will-change`.

Checklist: no layout shift from late content; third parties async/defer.
