---
name: swift
description: SwiftUI engineering on Apple platforms — Observation-based state, NavigationStack routing, render performance, and Swift 6.2 approachable concurrency (@MainActor, @concurrent, isolated conformances). Use for Swift/SwiftUI features, view models, navigation, concurrency migration, or data-race fixes.
---

Engineering guidance for declarative Apple UI and modern Swift concurrency. Covers architecture and performance; platform visuals, HIG, and motion belong in the **native-ui** skill.

## Non-negotiable rules

1. **Observation first** — New code uses `@Observable` classes, not `ObservableObject` / `@Published` / `@StateObject` / `@EnvironmentObject`.
2. **Minimal wrappers** — `@State` for view-owned values; `@Binding` for parent two-way links; `@Bindable` for observable two-way fields; `@Environment(Type.self)` for injected services.
3. **Small view structs** — Extract subviews so invalidation stays local; avoid `AnyView`; prefer `@ViewBuilder` / `Group` for conditionals.
4. **No work in `body`** — Network, disk, and heavy CPU stay out of `body` and `init`; load with `.task` (auto-cancel on disappear) or explicit async entry points.
5. **Type-safe navigation** — `NavigationStack` + `NavigationPath` (or bound path) with `Hashable` destinations and `.navigationDestination(for:)`.
6. **List performance** — `LazyVStack` / lazy stacks in scroll views; `ForEach` with stable IDs, never raw indices; limit shadows/blur/mask in scrolling content.
7. **Swift 6.2 default** — `async` stays on the **calling actor** unless you explicitly offload; do not assume background execution.
8. **`@concurrent` sparingly** — Only after Instruments shows CPU-bound hotspots; mark container `nonisolated`, function `@concurrent`, callers `await`.
9. **MainActor for UI domain** — View models, shared singletons, and global mutable app state belong on `@MainActor` (or MainActor default inference for app targets).
10. **Isolated conformances** — Prefer `@MainActor` protocol conformances over `nonisolated` hacks or unsafe type erasure when UI types implement shared protocols.
11. **Sendable at boundaries** — Data crossing actors/tasks must satisfy isolation rules; treat compiler data-race diagnostics as real bugs.
12. **Previews with fakes** — `#Preview` variants with injected mock repositories/services for empty, loading, and populated states.
13. **Design vs engineering** — Layout polish, SF Symbols usage, platform chrome → **native-ui**; structural code → **atlas** MCP; API docs → **biblos** MCP.

## References

| File | Load when |
|------|-----------|
| [reference/swiftui.md](reference/swiftui.md) | Composing views, state wiring, navigation router, list/chart performance, preview setup |
| [reference/concurrency.md](reference/concurrency.md) | Migrating to Swift 6.2, fixing isolation errors, `@concurrent` offload, globals and protocol conformances |
