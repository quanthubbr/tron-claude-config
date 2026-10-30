---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# React Native production readiness

Pin Expo SDK; EAS Build/Submit; separate profiles; credentials in EAS — not repo.

OTA via `expo-updates` for JS-only; native changes need store builds.

Crash reporting (e.g. Sentry) in release; structured logging; surface network failures.

Bump version/build numbers; `EXPO_PUBLIC_*` only for public config.

Pre-release: typecheck, lint, tests (≥80%), expo-doctor, E2E on real builds, secrets scan, physical device smoke.
