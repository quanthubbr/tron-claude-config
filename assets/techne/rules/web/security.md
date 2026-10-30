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
> Builds on the shared rules in `../common/security.md`.

# Web security

Production CSP with nonces for scripts where possible; tighten per project. No unsanitized HTML (`innerHTML` / framework escape hatches) without sanitizer.

Third-party scripts: async, SRI on CDNs, periodic audit. Security headers: HSTS, `nosniff`, frame deny, referrer policy, permissions policy.

Forms: CSRF on mutations; server validation; rate limits.

**exo-security** for deep review.
