---
paths:
  - "**/nuxt.config.*"
  - "**/app.config.*"
  - "**/server/**/*.ts"
---
> Builds on the shared rules in `../common/security.md`.

# Nuxt security

`runtimeConfig.public` and `useState`/`useFetch` payloads are client-visible — secrets server-only.

Validate body/query/params with h3 validated helpers or Zod.

Forward cookies on SSR outbound calls via `useRequestFetch` / explicit headers.

SSRF: never `$fetch` user-controlled URLs; allowlist hosts via config.

Sensitive external/auth/mutation routes → **exo-security** review.
