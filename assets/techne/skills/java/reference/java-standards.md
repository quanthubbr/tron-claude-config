# Java standards (17+)

## Framework detection

| Signal in build | Apply |
|-----------------|-------|
| `spring-boot` | `*Controller`, Spring Data, `@RestControllerAdvice` |
| `quarkus` | `*Resource`, CDI, Panache, Mutiny `Uni`/`Multi` |

If neither: language rules only.

## Naming and types

- Types `PascalCase`, members `camelCase`, constants `UPPER_SNAKE`.
- DTOs as records; entities keep behavior minimal.
- Generics with bounds: `<T extends Identifiable>`—no raw types.

## Immutability and Optional

```java
public record Money(BigDecimal amount, Currency currency) {}

public Optional<Market> findBySlug(String slug) {
  return repository.findBySlug(slug);
}

public MarketResponse require(String slug) {
  return findBySlug(slug)
      .map(MarketResponse::from)
      .orElseThrow(() -> new MarketNotFoundException(slug));
}
```

## Dependency injection

**Spring** — constructor injection:

```java
@Service
public class MarketService {
  private final MarketRepository markets;

  public MarketService(MarketRepository markets) {
    this.markets = markets;
  }
}
```

**Quarkus** — `@ApplicationScoped`, `@Inject` on constructor or package-private fields; avoid `@Singleton` when interceptors/lazy proxies are required.

## Reactive (Quarkus)

- Return `Uni`/`Multi` from resources; compose with `chain`, not blocking `firstResult()` inside reactive pipeline.
- Memoize shared `Uni` if multiple subscribers.

## Exceptions

- Unchecked domain exceptions (`MarketNotFoundException`) with context in message/fields.
- Map once at boundary:

```java
@RestControllerAdvice
class ApiErrors {
  @ExceptionHandler(MarketNotFoundException.class)
  ResponseEntity<ProblemDetail> missing(MarketNotFoundException ex) {
    return ResponseEntity.of(ProblemDetail.forStatusAndDetail(NOT_FOUND, ex.getMessage())).build();
  }
}
```

Quarkus: `ExceptionMapper` or `@ServerExceptionMapper`.

## Streams

- Short pipelines for map/filter/collect; switch to loops when nested or side-effect heavy.

## Layout

**Spring**

```
config/ controller/ service/ repository/ domain/ dto/
```

**Quarkus**

```
config/ resource/ service/ domain/ dto/ mapper/
```

## Logging

- Spring: SLF4J `LoggerFactory`, structured key=value in message.
- Quarkus: JBoss Logging `Logger.getLogger` or injected `Logger`.

## Configuration

- Spring: `@ConfigurationProperties` record/class bound in `@EnableConfigurationProperties`.
- Quarkus: `@ConfigMapping` interfaces (build-time validated) or `@ConfigProperty`.

## Testing matrix

| Layer | Spring | Quarkus |
|-------|--------|---------|
| Unit | JUnit5 + Mockito | JUnit5 + Mockito (no CDI) |
| Web slice | `@WebMvcTest` | REST Assured + `@QuarkusTest` |
| Data slice | `@DataJpaTest` | Panache test resource / Dev Services |
| Full stack | `@SpringBootTest` (sparse) | `@QuarkusTest` (sparse) |

Use AssertJ assertions; no `Thread.sleep` for synchronization—awaitility or hooks.

## Smells

- Long parameter lists → request record/builder.
- Deep nesting → guard clauses.
- Static mutable singletons → injected beans.
- Broad `catch (Exception)` without rethrow → central handler only.
