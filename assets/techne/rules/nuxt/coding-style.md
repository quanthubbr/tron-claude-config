---
paths:
  - "**/nuxt.config.*"
  - "**/app.config.*"
  - "**/app.vue"
  - "**/pages/**"
  - "**/layouts/**"
  - "**/middleware/**"
---
> Builds on the shared rules in `../common/coding-style.md`.

# Nuxt coding style

Default `app/` srcDir; check config before assuming paths. Rely on auto-imports — don't hand-import framework composables or duplicate app bootstrap.

`definePageMeta` static only. Split `nuxt.config.ts` (build), `runtimeConfig` (env, server vs `public`), `app.config.ts` (public reactive flags — never secrets).

Static head in config; reactive SEO via `useHead`/`useSeoMeta` in setup.

**techne:vue** covers Nuxt depth.
