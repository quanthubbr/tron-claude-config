---
name: react-native
description: React Native and Expo engineering — Expo Router file routes, Zod-validated params, TanStack Query server state, list virtualization, StyleSheet/NativeWind styling, native module hooks, and secure token storage. Use when building or reviewing RN/Expo screens, navigation, data layers, or device APIs.
---

Mobile React patterns for the managed Expo workflow and New Architecture defaults. Not for web DOM stacks — use **techne:react** / **techne:web** there. Native look-and-feel and platform conventions → **native-ui**.

## Non-negotiable rules

1. **Thin routes** — Files under `app/` parse/validate params and render a screen from `features/` or `components/`.
2. **Validate externals** — Zod (or equivalent) on deep-link params, push payloads, and JSON from APIs before use.
3. **Server state in the cache** — TanStack Query (or similar) owns remote data; do not mirror it into Zustand/Jotai.
4. **Virtualized lists** — `FlatList` / FlashList for non-trivial collections; never `ScrollView` + `.map` for long arrays.
5. **Stable list props** — Memoized row components, `useCallback` `renderItem`, deterministic `keyExtractor`.
6. **One styling system** — `StyleSheet.create` at module scope **or** utility classes (e.g. NativeWind); avoid fresh inline objects on hot paths.
7. **Secrets** — `expo-secure-store` (Keychain/Keystore) for tokens; AsyncStorage/MMKV only for non-sensitive prefs.
8. **UI states** — Every screen handles loading, error (with `accessibilityRole="alert"` when appropriate), and empty data explicitly.
9. **Native side effects in hooks** — Permissions, location, subscriptions live in `use*` hooks with cancellation flags / cleanup.
10. **No privileged keys in bundle** — Payment and admin secrets stay server-side; ship public keys only.
11. **Animation thread** — Prefer Reanimated for motion; keep heavy work off the JS thread.
12. **Dependency check** — Confirm New Architecture support before adding native modules.
13. **Support skills** — Shared TS idioms → **techne:quality** / coding standards; E2E → **techne:quality** browser-qa/e2e patterns with RN test libs; security → **exo-security**; API docs → **biblos** MCP.

## References

| File | Load when |
|------|-----------|
| [reference/expo-patterns.md](reference/expo-patterns.md) | Router layout, queries/mutations, lists, forms, hooks, anti-patterns |
