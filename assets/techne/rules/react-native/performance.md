---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/performance.md`.

# React Native performance

Memoize where it stops real re-renders; narrow state. Virtualized lists with stable `keyExtractor` and memoized `renderItem`.

`expo-image` with sized assets. Prefer Reanimated over JS-driven `Animated`.

Target New Architecture + Hermes; defer heavy work (`InteractionManager`). Profile with RN/React profilers — avoid deprecated debug tooling on New Arch.
