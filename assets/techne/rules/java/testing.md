---
paths:
  - "**/*.java"
---
# Java Testing

> Builds on the shared rules in `../common/testing.md`.

## Stack

JUnit 5, AssertJ, Mockito; Testcontainers when real infra is required.

## Layout

Mirror `src/main/java` under `src/test/java` (service, web, store, integration packages).

## Unit pattern

`@ExtendWith(MockitoExtension.class)` — mock ports, assert behavior, `verify` interactions. Name tests `method_scenario_outcome` plus `@DisplayName`.

## Parameterized

`@ParameterizedTest` + `@CsvSource` for table cases.

## Integration

Testcontainers for Postgres (or project default DB); wire repository against container JDBC URL.

## Coverage

~80% line coverage via JaCoCo; focus domain/services, skip boilerplate getters.

Depth: `techne:java` skill; workflow: `techne:quality` skill.
