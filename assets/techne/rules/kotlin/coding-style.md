---
paths:
  - "**/*.kt"
  - "**/*.kts"
---
# Kotlin Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Format

**ktlint** or **Detekt**; `kotlin.code.style=official` in Gradle when applicable.

## Immutability

Default `val`; immutable collections in public APIs; `copy` for state updates.

## Naming

Kotlin conventions; behavior-named interfaces (`Clickable`, not `IClickable`).

## Nulls

No `!!`; use `?.`, `?:`, `requireNotNull`, `checkNotNull`, or early returns.

## Sealed UI/state

```kotlin
sealed interface ScreenData<out T> {
    data object Busy : ScreenData<Nothing>
    data class Ready<T>(val payload: T) : ScreenData<T>
    data class Problem(val msg: String) : ScreenData<Nothing>
}
```

Exhaustive `when` — no stray `else`.

## Extensions

File per receiver type; avoid extensions on `Any`.

## Scope functions

`let` / `run` / `apply` / `also` — max two nested levels.

## Errors

`Result`, sealed errors, `runCatching`; rethrow `CancellationException`; no exception-driven control flow.

Depth: `techne:kotlin` skill.
