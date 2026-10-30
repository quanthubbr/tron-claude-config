# Android / KMP layering

## Module layout

```
app/              # Android entry, DI bootstrap
core/             # shared errors, utilities
domain/           # models, repository ports, use cases (pure Kotlin)
data/             # repo impls, local/remote sources, mappers
presentation/     # ViewModels, navigation, UI models
design-system/    # shared Compose theme/components
feature/<name>/   # optional vertical slices at scale
```

### Dependency direction

```
app → presentation, data, domain, core
presentation → domain, design-system, core
data → domain, core
domain → core (or nothing)
```

No `domain → data` or `domain → presentation`. No framework types in domain.

## Use cases

One class per application action; callable with `operator invoke`:

```kotlin
class FetchCatalogUseCase(private val catalog: CatalogRepository) {
    suspend operator fun invoke(category: CategoryId): Result<List<Product>> =
        catalog.productsIn(category)
}

class WatchCartUseCase(private val cart: CartRepository) {
    operator fun invoke(): Flow<CartSnapshot> = cart.observe()
}
```

## Repository port (domain)

```kotlin
interface CatalogRepository {
    suspend fun productsIn(category: CategoryId): Result<List<Product>>
    fun observeFeatured(): Flow<List<Product>>
}
```

## Data implementation

Split **local** and **remote** sources; repository merges and maps:

```kotlin
class CatalogRepositoryImpl(
    private val local: CatalogStore,
    private val remote: CatalogApi,
) : CatalogRepository {

    override suspend fun productsIn(category: CategoryId): Result<List<Product>> = runCatching {
        val dto = remote.fetch(category.value)
        local.upsert(dto.map { it.toEntity() })
        local.byCategory(category.value).map { it.toDomain() }
    }

    override fun observeFeatured(): Flow<List<Product>> =
        local.watchFeatured().map { rows -> rows.map { it.toDomain() } }
}
```

Keep mappers as extensions beside entity/DTO types (`toDomain()`, `toEntity()`).

## Persistence

**Room (Android)** — `@Entity`, `@Dao` with suspend + `Flow` queries; `@Upsert` for idempotent writes.

**SQLDelight (KMP)** — `.sq` files generate type-safe queries; share schema in `commonMain` when possible.

## Network (Ktor client)

```kotlin
class CatalogApi(private val http: HttpClient) {
    suspend fun fetch(category: String): List<ProductDto> =
        http.get("catalog") { parameter("category", category) }.body()
}

val http = HttpClient {
    install(ContentNegotiation) { json(Json { ignoreUnknownKeys = true }) }
    defaultRequest { url("https://api.example.com/") }
}
```

## Dependency injection

- **Koin** — multiplatform-friendly; `module { factory { … }; single<Port> { Impl(get()) }; viewModelOf(::ScreenModel) }`.
- **Hilt** — Android-only; `@Binds` modules + `@HiltViewModel`.

Wire modules per layer (`domainModule`, `dataModule`, `presentationModule`) from `app`.

## Errors in presentation

Map `Result` or sealed `Try` to UI state in ViewModel — do not leak `SQLException` or HTTP types to composables.

## Gradle convention plugins (KMP)

Extract shared `kotlin { androidTarget(); ios*(); sourceSets { … } }` into `build-logic` to deduplicate module scripts.

## Avoid

- Entities/DTOs in composables.
- Business rules duplicated in ViewModels.
- God repositories — split sources, compose in impl.
- Circular module dependencies.

UI consumption: **reference/compose-multiplatform-patterns.md**. Async: **reference/kotlin-coroutines-flows.md**.
