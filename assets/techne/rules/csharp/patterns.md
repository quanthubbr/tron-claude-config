---
paths:
  - "**/*.cs"
  - "**/*.csx"
---
# C# Patterns

> Builds on the shared rules in `../common/patterns.md`.

## API wrapper

```csharp
public sealed record ApiResult<T>(bool Ok, T? Payload = default, string? Error = null);
```

## Repository

Async CRUD interface with `CancellationToken` on each method.

## Options

Strongly typed `IOptions<T>` sections — no magic string keys scattered in code.

## DI lifetimes

Singleton for stateless/shared infra; scoped per request; transient for cheap workers; split god-services instead of huge constructors.

Depth: `techne:dotnet` skill.
