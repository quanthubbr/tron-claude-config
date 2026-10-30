---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/patterns.md`.

# React Native patterns

Do not install web DOM rules in RN projects.

Expo Router: thin route files; Zod-validate deep link params with `safeParse` + redirect.

Separate server cache, UI state, route params, forms; secure tokens in `expo-secure-store`.

Lists: `FlatList`/`FlashList` — not huge `.map` in `ScrollView`. Custom hooks for device APIs.

Cleanup effects; ignore stale async on unmount. **techne:react-native** skill.
