# Spring Boot patterns

## REST layer

```java
@RestController
@RequestMapping("/api/markets")
@Validated
class MarketController {
  private final MarketService service;

  MarketController(MarketService service) {
    this.service = service;
  }

  @GetMapping
  Page<MarketResponse> list(@RequestParam(defaultValue = "0") int page,
                            @RequestParam(defaultValue = "20") int size) {
    return service.list(PageRequest.of(page, size, Sort.by("createdAt").descending()))
        .map(MarketResponse::from);
  }

  @PostMapping
  ResponseEntity<MarketResponse> create(@Valid @RequestBody CreateMarketRequest body) {
    var created = service.create(body);
    return ResponseEntity.status(HttpStatus.CREATED).body(MarketResponse.from(created));
  }
}
```

Keep controllers free of repository calls and transaction boundaries.

## Service + repository

```java
public interface MarketRepository extends JpaRepository<MarketEntity, Long> {
  @Query("select m from MarketEntity m where m.status = :status")
  List<MarketEntity> findByStatus(@Param("status") MarketStatus status, Pageable page);
}

@Service
public class MarketService {
  private final MarketRepository repo;

  @Transactional
  public Market create(CreateMarketRequest req) {
    return Market.from(repo.save(MarketEntity.from(req)));
  }

  @Transactional(readOnly = true)
  public Page<Market> list(Pageable page) {
    return repo.findAll(page).map(Market::from);
  }
}
```

## Validation DTOs

Use records with Jakarta validation annotations; nested lists: `@NotEmpty List<@NotBlank String>`.

## Global errors

Handle `MethodArgumentNotValidException` → 400 with field messages; `AccessDeniedException` → 403; unknown → 500 with logged stack, generic body.

Enable problem details (Boot 3+) for consistent JSON error shape.

## Caching

`@EnableCaching` on configuration class.

```java
@Cacheable(value = "market", key = "#id")
public Market get(Long id) { ... }

@CacheEvict(value = "market", key = "#id")
public void evict(Long id) { ... }
```

Evict on writes touching the same key.

## Async and scheduling

- `@EnableAsync` + `@Async` on fire-and-forget notifications; return `CompletableFuture` when caller needs completion.
- `@Scheduled` jobs must be idempotent; guard with distributed lock when horizontally scaled.

## Filters

`OncePerRequestFilter` for request timing and correlation IDs; log method, URI, status, durationMs.

## External calls

Wrap retries with exponential backoff; cap attempts; respect interrupt flag on `Thread.sleep`.

## Rate limiting

Bucket4j (or gateway-level limits). Identify clients with `request.getRemoteAddr()` **after** configuring trusted forward headers (`server.forward-headers-strategy`, `ForwardedHeaderFilter`). Do not read spoofable forwarded headers directly.

## Observability

- JSON logging encoder in prod.
- Micrometer metrics → Prometheus or OTLP.
- Tracing via Micrometer Tracing (OpenTelemetry exporter).

## Production defaults

- Tune Hikari pool (size, connection timeout) to workload.
- Profile-specific `application-{profile}.yaml`.
- Kafka/SQS consumers: manual ack after successful processing; dead-letter on poison messages.
