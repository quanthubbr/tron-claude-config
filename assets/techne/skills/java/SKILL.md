---
name: java
description: Java 17+ style plus Spring Boot layering for REST services, JPA, caching, and validation. Use when writing or reviewing Java in Spring Boot (or Quarkus) backends.
---

# techne:java

Java language conventions and Spring Boot architecture. API/error patterns shared with other stacks live in **techne:services**; delivery and profiles in **techne:delivery**; QA gates in **techne:quality**.

## Non-negotiables

1. Detect framework from the build file: `spring-boot` → Spring rules; `quarkus` → Quarkus rules (JAX-RS `*Resource`, CDI scopes, Uni/Multi).
2. Constructor injection only on Spring services; no `@Autowired` fields. Prefer records/immutable DTOs for API payloads.
3. `find*` methods return `Optional`; never call `.get()` without a guard—map or `orElseThrow` with domain exceptions.
4. Controllers/resources validate with Bean Validation (`@Valid`); map domain errors in one `@ControllerAdvice` / `ExceptionMapper`.
5. `@Transactional` on service mutations; `@Transactional(readOnly = true)` on query-only service methods.
6. Pagination: always pass explicit `Sort` (e.g. `createdAt` desc) with `PageRequest`—never rely on implicit ordering.
7. Spring Boot 3+: enable RFC 7807 problem details (`spring.mvc.problemdetails.enabled=true`) for API errors.
8. Rate limits and audit logs: derive client IP from `getRemoteAddr()` after trusted proxy/`ForwardedHeaderFilter` setup—never trust raw `X-Forwarded-For`.
9. Tests: JUnit 5 + AssertJ; `@WebMvcTest` for web slices, `@DataJpaTest` for repos; reserve `@SpringBootTest` for full integration.
10. Quarkus: prefer `@ApplicationScoped` over `@Singleton` when proxies needed; no blocking JPA calls inside `Uni` chains.
11. **biblos** MCP for framework APIs; **atlas** MCP for module layout.

## References

| File | Load when |
|------|-----------|
| [reference/java-standards.md](reference/java-standards.md) | Naming, immutability, DI, Quarkus reactive, logging, tests |
| [reference/springboot.md](reference/springboot.md) | REST controllers, JPA repos, cache, async, filters, observability |
