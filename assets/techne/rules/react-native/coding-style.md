---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/coding-style.md`.

# React Native style

Function components; typed props; thin screens composing hooks + presentational pieces.

One styling approach per app (`StyleSheet.create` at module scope or utility classes — no inline style objects on hot paths). Centralize tokens.

Platform files (`.ios.tsx`/`.android.tsx`) for large diffs; `Platform.select` for tiny tweaks. Safe areas via `react-native-safe-area-context`.

Path aliases; feature folders; no `console.log` in release. TypeScript rules from [typescript/](../typescript/).
