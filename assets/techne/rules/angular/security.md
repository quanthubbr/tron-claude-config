---
paths:
  - "**/*.component.ts"
  - "**/*.component.html"
  - "**/*.service.ts"
  - "**/*.interceptor.ts"
---
> Builds on the shared rules in `../common/security.md`.

# Angular security

Angular sanitizes bound values by default — do not call `bypassSecurityTrust*` on user-controlled strings without review.

Prefer `innerText` or sanitizing pipes over `[innerHTML]` for untrusted content.

Use `HttpClient` so auth/error interceptors always run — avoid ad hoc `fetch`.

Environment files describe shape; inject real secrets via CI/CD env or secret manager — not committed literals.

Protect admin routes with functional guards (`canMatch` prevents lazy chunk download). UI hiding is not authorization.

SSR: never transfer private config through `TransferState`; gate DOM APIs with `isPlatformBrowser`.

Configure CSP without `unsafe-eval`; use nonces for unavoidable inline scripts during SSR.

**exo-security** / `security-review` before merging auth or PII features.
