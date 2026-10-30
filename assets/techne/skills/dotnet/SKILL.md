---
name: dotnet
description: C# idioms, async/await, DI, Options, EF Core repositories, and ASP.NET Core minimal APIs. Use when writing or reviewing .NET backend code.
---

# techne:dotnet

.NET/C# patterns for ASP.NET Core services. Broader service design: **techne:services**; SQL/EF migrations: **techne:databases**; verification: **techne:quality**.

## Non-negotiables

1. Prefer `record` types and `init` accessors for DTOs; mutability only inside true domain entities with invariants.
2. Constructor-inject dependencies; null-check collaborators or use primary constructors with required members.
3. Async end-to-end: pass `CancellationToken` through public APIs; never `.Result` / `.Wait()` on task objects.
4. Register services against interfaces (`AddScoped<IRepo, SqlRepo>`); no `new` for infrastructure inside handlers.
5. Bind config with **Options** pattern (`IOptions<T>` / `IOptionsMonitor<T>`), not raw `IConfiguration` in business code.
6. EF Core reads: `AsNoTracking()` for query endpoints; explicit `Include` only when needed; filter/sort in SQL, not in memory.
7. Expected failures (validation, not-found business rules): return `Result<T>` or typed problem details—not generic 500s.
8. Minimal APIs: group routes with `MapGroup`, `RequireAuthorization`, and `TypedResults` for OpenAPI-friendly responses.
9. Guard clauses at method top (`ArgumentNullException.ThrowIfNull`, range checks) to avoid nested conditionals.
10. **biblos** MCP for Microsoft/docs APIs; **atlas** MCP for solution layout.

## References

| File | Load when |
|------|-----------|
| [reference/dotnet-core.md](reference/dotnet-core.md) | Async, DI, Options, EF Core, middleware, minimal APIs, pitfalls |
