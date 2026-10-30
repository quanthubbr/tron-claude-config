---
paths:
  - "**/*.kt"
  - "**/*.kts"
---
# Kotlin Patterns

> Builds on the shared rules in `../common/patterns.md`.

## DI

Constructor injection; Koin on KMP, Hilt on Android-only stacks.

## ViewModel

Single `StateFlow`, event sink, one-way flow:

```kotlin
data class ListUi(val rows: List<Row> = emptyList(), val busy: Boolean = false)

class ListVm(private val load: LoadRows) : ViewModel() {
    private val _ui = MutableStateFlow(ListUi())
    val ui = _ui.asStateFlow()
    fun onIntent(ev: ListIntent) { /* map to load/delete */ }
}
```

## Repository

`suspend` + `Result` or typed errors; `Flow` for observation; coordinate local/remote.

## Use cases

`operator fun invoke` per action.

## KMP

`expect`/`actual` for platform storage, logging, etc.

## Coroutines

`viewModelScope`; `stateIn(..., WhileSubscribed(5_000), initial)` for hot UI state; `supervisorScope` when child failures must not cancel siblings.

Depth: `techne:kotlin` skill (coroutines, Compose, clean architecture).
