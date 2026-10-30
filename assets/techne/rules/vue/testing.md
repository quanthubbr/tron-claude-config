---
paths:
  - "**/*.vue"
---
> Builds on the shared rules in `../common/testing.md`.

# Vue testing

Vitest + `@vue/test-utils`; `happy-dom`/`jsdom`. `mount` vs `shallowMount`; await `trigger`/`setValue`.

Test props/emits/slots — not internals. Pinia: `createTestingPinia` or isolated store per test.
