---
name: services
description: Backend and API engineering — layered Node/Express/Next/Nest services, REST contracts, typed errors, ports-and-adapters boundaries, MCP servers. Use when designing APIs, server modules, persistence, jobs, or TypeScript MCP tooling.
---

Scope: design and implement server-side features with clear layers, stable HTTP contracts, and testable domain boundaries. Map persistence/cache/auth details to `techne:databases` and delivery to `techne:delivery` when those dominate the task. Use `biblos` MCP for library/API signatures; `atlas` MCP to locate existing modules. Session notes: `/session-handoff`. Reviews: `security-review` / `exo-security`, `exo-qa`; Nest/Node implementation work can delegate to `exo-backend`.

## Non-negotiable rules

1. **Thin transport** — controllers/routes parse/validate input, call application services, map results to HTTP; no business rules in handlers.
2. **REST semantics** — nouns in URLs, correct status codes (no `200` with `success: false`); validate bodies with schemas (Zod, class-validator, etc.).
3. **Error contract** — structured `{ error: { code, message, details? } }`; log full context server-side; never return stack traces or SQL to clients.
4. **Operational errors vs bugs** — typed/domain errors with stable `code`; unexpected failures become generic 500 after logging.
5. **Data access** — repository or port behind services; avoid N+1 (batch/join); select only needed columns; transactions for multi-write invariants.
6. **Caching** — cache-aside with explicit TTL and invalidation; production rate limits use shared stores (Redis/gateway), not per-process counters on scaled runtimes.
7. **AuthZ** — authenticate at the edge; authorize per resource in the service layer; JWT/session checks are not a substitute for server-side permission checks on mutations.
8. **Hexagonal slice** — domain free of framework imports; use cases depend on port interfaces; adapters map HTTP/ORM/SDK; wire in one composition root.
9. **Retries** — exponential backoff with jitter on transient failures only; do not retry most 4xx; propagate `abortSignal` on outbound HTTP.
10. **NestJS** — global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; response DTOs, not ORM entities; env validated at bootstrap.
11. **MCP servers** — schema-first tools; transport isolated from tool logic; pin SDK versions; verify registration APIs via `biblos` MCP (SDKs change).
12. **Git hygiene** — conventional commit messages in English; no Co-Authored-By or AI attribution trailers; never skip git hooks or force-push shared branches.

## References

| File | Load when |
|------|-----------|
| [reference/backend-layers.md](reference/backend-layers.md) | Repositories, services, middleware, DB/cache/jobs/logging |
| [reference/api-contracts.md](reference/api-contracts.md) | REST shape, pagination, filtering, versioning, rate-limit headers |
| [reference/errors-and-resilience.md](reference/errors-and-resilience.md) | Error types, Result pattern, retries, user-facing messages |
| [reference/hexagonal-boundaries.md](reference/hexagonal-boundaries.md) | Ports/adapters layout, migration, testing by boundary |
| [reference/nestjs.md](reference/nestjs.md) | Modules, DTOs, guards, filters, config, Nest tests |
| [reference/mcp-servers.md](reference/mcp-servers.md) | Building MCP servers (tools/resources/transport) |
