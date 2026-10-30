---
paths:
  - "**/*.java"
---
# Java Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Repository

```java
public interface ShipmentStore {
    Optional<Shipment> byId(long id);
    List<Shipment> all();
    Shipment save(Shipment row);
    void remove(long id);
}
```

Implementations hide JDBC/JPA/in-memory details.

## Services

Business rules live in services; controllers and stores stay thin. Constructor-inject collaborators — no field `@Inject` / `@Autowired`.

## DTOs

Records at boundaries with static mappers:

```java
public record ShipmentView(long id, String label, BigDecimal weight) {
    public static ShipmentView from(Shipment s) {
        return new ShipmentView(s.id(), s.label(), s.weight());
    }
}
```

## Builders

For many optional fields — explicit builder type with fluent setters and `build()`.

## Sealed results

Model payment outcomes as sealed interfaces + exhaustive switch.

## API envelope

```java
public record ApiPayload<T>(boolean ok, T body, String fault) {
    public static <T> ApiPayload<T> success(T body) { return new ApiPayload<>(true, body, null); }
    public static <T> ApiPayload<T> failure(String fault) { return new ApiPayload<>(false, null, fault); }
}
```

Depth: `techne:java` skill (Spring and persistence references).
