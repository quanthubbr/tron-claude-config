# Compose / Compose Multiplatform

## State hoisting pattern

ViewModel holds `MutableStateFlow<ScreenState>`; composables receive plain `ScreenState` + event lambda.

```kotlin
data class CatalogState(
    val entries: List<ProductUi> = emptyList(),
    val busy: Boolean = false,
    val fault: String? = null,
    val filter: String = "",
)

class CatalogViewModel(private val load: FetchCatalogUseCase) : ViewModel() {
    private val _ui = MutableStateFlow(CatalogState())
    val ui: StateFlow<CatalogState> = _ui.asStateFlow()

    fun onFilter(text: String) {
        _ui.update { it.copy(filter = text) }
        refresh(text)
    }

    private fun refresh(query: String) = viewModelScope.launch {
        _ui.update { it.copy(busy = true, fault = null) }
        load(CategoryId(query)).fold(
            onSuccess = { list -> _ui.update { it.copy(entries = list.map { p -> p.toUi() }, busy = false) } },
            onFailure = { e -> _ui.update { it.copy(fault = e.message, busy = false) } },
        )
    }
}
```

```kotlin
@Composable
fun CatalogRoute(vm: CatalogViewModel = koinViewModel()) {
    val snapshot by vm.ui.collectAsStateWithLifecycle()
    CatalogPanel(state = snapshot, onFilter = vm::onFilter)
}

@Composable
fun CatalogPanel(state: CatalogState, onFilter: (String) -> Unit) { /* previews here */ }
```

## Event sink (wide screens)

```kotlin
sealed interface CatalogIntent {
    data class Filter(val text: String) : CatalogIntent
    data class Open(val id: String) : CatalogIntent
    data object Reload : CatalogIntent
}

fun reduce(intent: CatalogIntent) = when (intent) { /* dispatch */ }
```

Single `onIntent: (CatalogIntent) -> Unit` keeps composable signatures stable.

## Navigation (type-safe, Navigation 2.8+)

```kotlin
@Serializable data object HubRoute
@Serializable data class DetailRoute(val id: String)

NavHost(controller, startDestination = HubRoute) {
    composable<HubRoute> {
        HubScreen(onOpen = { id -> controller.navigate(DetailRoute(id)) })
    }
    composable<DetailRoute> { entry ->
        val args = entry.toRoute<DetailRoute>()
        DetailScreen(args.id)
    }
    dialog<ConfirmRoute> { /* modal */ }
}
```

Pass navigation lambdas downward; do not thread `NavController` into leaf composables.

## Composable API design

- Slot parameters (`header`, `content`, `actions`) for flexible layout shells.
- Modifier order: layout → clip/shape → draw → click/focus.

## KMP platform hooks

```kotlin
// commonMain
@Composable expect fun SystemChrome(darkIcons: Boolean)

// androidMain — status bar via Accompanist or EdgeToEdge APIs
// iosMain — UIKit bridge or plist configuration
```

## Performance

- Mark UI models `@Immutable` when all properties are stable primitives/strings.
- `LazyColumn` / `LazyVerticalGrid`: always provide `key = { item.id }`.
- Heavy filtering: `remember(list) { list.filter { … } }`, not inline on every frame.
- Scroll-linked UI: `derivedStateOf { listState.firstVisibleItemIndex > N }`.
- Do not allocate fresh lambdas/lists in hot paths without `remember`/`key`.

## Theming

Wrap screens in `MaterialTheme` with light/dark schemes; on Android 12+ optional dynamic color from wallpaper. Shared tokens live in **design-system** module.

## Avoid

- `mutableStateOf` inside ViewModels (prefer `StateFlow`).
- Business logic or network I/O inside `@Composable` bodies.
- `LaunchedEffect(Unit)` as a stand-in for ViewModel initialization when state must survive process death/rotation.
- Passing unstable anonymous objects as composable parameters each recomposition.

Layer boundaries: **reference/android-clean-architecture.md**. Flow collection: **reference/kotlin-coroutines-flows.md**.
