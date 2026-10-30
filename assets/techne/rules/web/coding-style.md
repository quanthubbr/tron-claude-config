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
> Builds on the shared rules in `../common/coding-style.md`.

# Web coding style

Group by feature (component folders with colocated styles). Design tokens in CSS variables — spacing, type, color, motion — not scattered literals.

Animate `transform`, `opacity`, `clip-path`; avoid layout properties (`width`, `margin`, `top`, etc.).

Semantic HTML (`header`, `nav`, `main`, `section`) before div soup.

Naming: PascalCase components; `use*` hooks; kebab-case classes; camelCase animation ids.

Deep patterns: load **techne:web** skill on demand.
