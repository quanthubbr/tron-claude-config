---
paths:
  - "**/nuxt.config.*"
  - "**/server/**/*.ts"
  - "**/pages/**"
  - "**/layouts/**"
  - "**/middleware/**"
---
> Builds on the shared rules in `../common/testing.md`.

# Nuxt testing

`@nuxt/test-utils` + Vitest (`environment: 'nuxt'`). `mountSuspended`, `mockNuxtImport`, `registerEndpoint` for Nitro stubs.

E2E via bundled Playwright helpers when configured. **techne:vue** testing references.
