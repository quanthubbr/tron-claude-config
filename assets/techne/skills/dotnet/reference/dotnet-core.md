# .NET / C# core

## Immutability and nullability

```csharp
public sealed record Money(decimal Amount, string Currency);

public sealed class CreateOrderRequest
{
    public required string CustomerId { get; init; }
    public required IReadOnlyList<OrderLine> Lines { get; init; }
}
```

Enable nullable reference types; express optional returns as `T?` or `Result<T>`.

## Dependency injection

```csharp
public interface IOrderRepository
{
    Task<Order?> FindByIdAsync(Guid id, CancellationToken cancellationToken);
    Task AddAsync(Order order, CancellationToken cancellationToken);
}

builder.Services.AddScoped<IOrderRepository, SqlOrderRepository>();
builder.Services.AddScoped<IOrderService, OrderService>();
```

Primary constructors (C# 12+) are fine when all dependencies are injected interfaces.

## Async

```csharp
public async Task<OrderSummary> BuildSummaryAsync(Guid id, CancellationToken cancellationToken)
{
    var order = await _orders.FindByIdAsync(id, cancellationToken)
        ?? throw new NotFoundException(id);

    var buyer = await _customers.GetAsync(order.CustomerId, cancellationToken);
    return OrderSummary.From(order, buyer);
}
```

Parallel independent IO:

```csharp
await Task.WhenAll(fetchOrders, fetchMetrics);
```

Never block on `Task` in ASP.NET request threads.

## Options

```csharp
public sealed class EmailOptions
{
    public const string SectionName = "Email";
    public required string Host { get; init; }
    public int Port { get; init; } = 587;
}

builder.Services.Configure<EmailOptions>(
    builder.Configuration.GetSection(EmailOptions.SectionName));
```

Inject `IOptions<EmailOptions>` or `IOptionsMonitor<EmailOptions>` for reload-safe settings.

## Result instead of exceptions (expected failures)

```csharp
public readonly record struct Result<T>(bool Ok, T? Value, string? Error)
{
    public static Result<T> Success(T value) => new(true, value, null);
    public static Result<T> Fail(string message) => new(false, default, message);
}
```

Use for validation/business rejections; reserve exceptions for truly exceptional faults.

## EF Core repository sketch

```csharp
public async Task<Order?> FindByIdAsync(Guid id, CancellationToken cancellationToken)
{
    return await _db.Orders
        .Include(o => o.Lines)
        .AsNoTracking()
        .FirstOrDefaultAsync(o => o.Id == id, cancellationToken);
}
```

Track entities only inside command handlers that mutate state.

## Middleware

Register custom middleware with `app.UseMiddleware<RequestTimingMiddleware>()`; log elapsed ms and status code; avoid swallowing exceptions.

## Minimal APIs

```csharp
var orders = app.MapGroup("/api/orders").RequireAuthorization().WithTags("Orders");

orders.MapGet("/{id:guid}", async (Guid id, IOrderRepository repo, CancellationToken ct) =>
{
    var order = await repo.FindByIdAsync(id, ct);
    return order is null ? Results.NotFound() : Results.Ok(order);
});
```

Use `TypedResults` for OpenAPI metadata; validate bodies with `[AsParameters]` or explicit records + `Results.ValidationProblem`.

## Guard clauses

Validate arguments first (`ThrowIfNull`, range checks) so happy path stays flat.

## Anti-patterns

| Issue | Remedy |
|-------|--------|
| `async void` (non-events) | return `Task` |
| `.Result` / `.Wait()` | `await` |
| empty `catch` | log + throw or map to problem detail |
| `new SqlConnection` in controller | injected factory/repository |
| `dynamic` in domain | strong types/generics |
| mutable static fields | scoped/singleton services |

## Tooling

- `dotnet format` in CI; analyzers (nullable, CA rules) as errors where team agrees.
- Integration tests: `WebApplicationFactory` with test containers or SQLite provider per **techne:databases** guidance.
