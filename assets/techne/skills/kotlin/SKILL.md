---
name: kotlin
description: Kotlin for JVM servers, Android, and Kotlin Multiplatform — idiomatic language use, Kotest/MockK testing, coroutines and Flow, clean layering, Jetpack/Compose Multiplatform UI. Use when writing or reviewing Kotlin, Gradle KMP modules, Room/SQLDelight, Ktor clients, ViewModels, or Compose screens.
---

# techne:kotlin

Covers idiomatic Kotlin, test strategy, async streams, Android/KMP layering, and Compose UI. Load reference files only for the task at hand. Server-side JVM patterns overlap **techne:java** / **techne:services**; mobile UI polish defers to **ui-design** (`audit`, `harden`). TDD and coverage gates live in **techne:quality**; reviews via **code-review** / **exo-qa** and **security-review** / **exo-security**. Library APIs: **biblos** MCP; structure: **atlas** MCP.

## Non-negotiable rules

1. Default to `val`, immutable collections, and `data class` value types; mutate via `copy()`, not mutable fields on shared models.
2. Treat nullability in the type system: no `!!`; prefer safe calls, Elvis defaults, or explicit `require`/`check` failures.
3. Restricted outcomes → sealed class/interface or `Result`; never use exceptions for normal control flow.
4. Concurrency stays structured: `coroutineScope`/`supervisorScope`, lifecycle scopes (`viewModelScope`, `LaunchedEffect`); never `GlobalScope`.
5. **Domain** modules are pure Kotlin — no Android, Compose, Room, or network imports.
6. Presentation consumes **domain models** only; map Room entities, SQLDelight rows, and DTOs inside **data**.
7. ViewModels orchestrate UI state; **use cases** own business rules and repository coordination.
8. Screen state: one immutable data class in `MutableStateFlow`; updates via `_state.update { it.copy(...) }` with immutable list/map replacements.
9. One-shot UI signals (snackbar, navigation) → `SharedFlow`/`Channel`, not extra fields on persistent state.
10. UI-bound cold flows → `stateIn(..., SharingStarted.WhileSubscribed(5_000), initial)` to survive rotation without leaking collectors.
11. Tests: Kotest + MockK; suspend fakes use `coEvery`/`coVerify`; coroutine tests use `runTest` (never `Thread.sleep`).
12. Coverage: Kover with project floor (typically 80%+); `./gradlew koverVerify` in CI; exclude generated/config packages.
13. Compose: keep `@Composable` trees stateless where possible; collect `StateFlow` with lifecycle-aware APIs; stable keys in lazy lists.
14. KMP dispatchers: `Dispatchers.IO` is JVM/Android-only — prefer `Default` or inject platform IO on native targets.

## References

| File | Load when |
|------|-----------|
| [reference/kotlin-patterns.md](reference/kotlin-patterns.md) | Idioms, null safety, sealed types, scope functions, extensions, Gradle Kotlin DSL, sequences |
| [reference/kotlin-testing.md](reference/kotlin-testing.md) | Kotest styles, MockK, `runTest`, Flow/Turbine tests, Kover, Ktor `testApplication` |
| [reference/kotlin-coroutines-flows.md](reference/kotlin-coroutines-flows.md) | `async` parallelism, StateFlow/SharedFlow, operators, cancellation, dispatcher rules |
| [reference/android-clean-architecture.md](reference/android-clean-architecture.md) | Module graph, use cases, repositories, Room/SQLDelight/Ktor, Koin/Hilt wiring |
| [reference/compose-multiplatform-patterns.md](reference/compose-multiplatform-patterns.md) | ViewModel state, navigation, slots, performance, theming, expect/actual UI |
