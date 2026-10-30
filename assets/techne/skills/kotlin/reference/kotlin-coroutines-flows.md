# Coroutines and Flow

## Scope hierarchy

```
Application / ViewModel
  └── coroutineScope { }
        ├── async { }  // parallel
        └── launch { } // fire-and-forget child
```

Bind work to a parent job so cancellation tears down children. Android: `viewModelScope`; Compose: `LaunchedEffect(keys)`; tests: `runTest` scope.

## Parallel reads

```kotlin
suspend fun buildOverview(): Overview = coroutineScope {
    val orders = async { orderPort.recent() }
    val metrics = async { analyticsPort.today() }
    Overview(orders.await(), metrics.await())
}
```

Use `supervisorScope` when sibling tasks must survive peer failure (dashboard tiles, sync workers). Still rethrow `CancellationException`.

## Flow building blocks

| Type | Role |
|------|------|
| Cold `flow { }` | On-demand emissions, map DB/network |
| `StateFlow` | Hot state holder for UI |
| `SharedFlow` | Ephemeral events (snackbar, nav) |

### UI state wiring

```kotlin
val themeMode: StateFlow<ThemeMode> = settingsRepo.watchTheme()
    .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = ThemeMode.System,
    )
```

Combine sources with `combine(a, b, c) { … }.stateIn(…)`.

### Operators (common)

- Search: `debounce(300)`, `distinctUntilChanged()`, `flatMapLatest { repo.search(it) }`, terminal `.catch { emit(emptyList()) }`.
- Retry: `retryWhen { cause, attempt -> cause is IOException && attempt < 3 && delay(backoff); true }`.

### Effects channel

```kotlin
private val _events = MutableSharedFlow<UiEvent>()
val events = _events.asSharedFlow()

fun onDelete(id: ItemId) = viewModelScope.launch {
    repo.remove(id)
    _events.emit(UiEvent.Toast("Removed"))
}
```

Collect effects in Compose inside `LaunchedEffect(Unit) { events.collect { … } }`.

## Dispatchers

| Work | Dispatcher |
|------|------------|
| CPU parse/transform | `Default` |
| Blocking IO (JVM/Android) | `IO` |
| Touch UI state | `Main` |

KMP common code: avoid hard-coded `IO`; abstract via interface or use `Default` on native.

## Cancellation

- Long loops: `ensureActive()` or cooperative APIs.
- Cleanup: `try/finally`; use `withContext(NonCancellable) { release() }` only for resource teardown.
- Never swallow `CancellationException`.

## Testing notes

- Fake repos expose `MutableStateFlow` for `observe*` APIs.
- Turbine on ViewModel `state` after `advanceUntilIdle()`.
- Detailed MockK/`runTest` patterns: **reference/kotlin-testing.md**.

## Avoid

- Collecting flows in `init {}` without a scope.
- Mutating lists/maps inside `StateFlow` value — always replace with immutable copies.
- `flowOn(Main)` to fix collection thread — collector runs on caller context.
- Instantiating new `flow { }` in composables without `remember`.
