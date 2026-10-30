---
paths:
  - "**/*.java"
---
# Java Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Format

- **google-java-format** or **Checkstyle** (Google/Sun) — match the repo.
- One public top-level type per file; stable member order (constants → fields → ctors → public → protected → private).

## Immutability

- `record` for values (16+); `final` fields by default.
- Expose copies: `List.copyOf`, `Map.copyOf`, `Set.copyOf`.
- Prefer new instances over in-place mutation.

```java
public record InvoiceLine(long sku, BigDecimal qty) {}

public class Cart {
    private final long id;
    private final List<InvoiceLine> lines;
    public List<InvoiceLine> lines() { return List.copyOf(lines); }
}
```

## Naming

PascalCase types; camelCase members; `SCREAMING_SNAKE_CASE` constants; lowercase reverse-DNS packages.

## Modern syntax

Records, sealed hierarchies, pattern `instanceof`, text blocks, switch expressions, switch patterns (21+) where they clarify intent.

## Optional

- Return `Optional` from finders; chain `map` / `flatMap` / `orElseThrow`.
- Never `Optional` fields or parameters.

## Errors

Domain unchecked exceptions; narrow catches; messages include ids/context.

## Streams

Short pipelines (≤4 ops); method refs when clear; prefer loops for gnarly logic.

Depth: `techne:java` skill.
