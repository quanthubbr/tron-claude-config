---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/testing.md`.

# React Native testing

Jest + `@testing-library/react-native` (`jest-expo`); Maestro or Detox for E2E on CI builds.

Query by role/label; mock Expo modules and router; fresh QueryClient per test.

Cover auth/navigation/core flows before release. TDD via **exo-qa** guidance.
