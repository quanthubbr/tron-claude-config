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

# Web design quality

Avoid generic template UI. Before coding: pick a deliberate direction (not vague "clean minimal"); define palette and type; gather references; use **ui-design** (`audit`, `harden`) for a11y/finish.

Ship hierarchy, rhythm, states (hover/focus/active), and intentional light/dark when both exist. Skip stock hero + gradient blob defaults and uniform card grids with no POV.

Checklist: not a default component-library clone; believable in a product screenshot; meaningful interaction states.
