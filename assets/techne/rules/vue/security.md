---
paths:
  - "**/*.vue"
---
> Builds on the shared rules in `../common/security.md`.

# Vue security

`{{ }}` and bound attrs escape; `v-html` and dynamic `:is` from users do not. Sanitize HTML; block `javascript:` in URLs; never bind user strings to `:style` objects or event attrs.

`import.meta.env.VITE_*` is public. Sessions via httpOnly cookies.
