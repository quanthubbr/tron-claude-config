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
> Builds on the shared rules in `../common/testing.md`.

# Web testing

Priority: visual regression at key breakpoints → a11y (keyboard, contrast, reduced motion) → Lighthouse/CWV → cross-browser (Chrome/Firefox/Safari) → responsive widths.

Playwright for E2E/visual; unit tests for utilities/hooks. Deterministic waits, not arbitrary sleeps.

**techne:quality** skill for broader QA patterns.
