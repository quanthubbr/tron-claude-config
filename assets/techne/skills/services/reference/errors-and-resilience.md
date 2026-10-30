# Errors and resilience

## Principles

1. Fail fast at boundaries; do not swallow `catch` without log, remap, or rethrow.
2. Errors are typed values with stable `code` for clients.
3. User-visible text ≠ engineer logs (no stacks in responses).
4. Document every error code clients may see.

## TypeScript hierarchy

```ts
export class ServiceError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus = 500,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ServiceError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MissingEntityError extends ServiceError {
  constructor(kind: string, id: string) {
    super(`${kind} not found`, 'NOT_FOUND', 404, { id });
  }
}
```

Central mapper maps `ServiceError`, validation library errors, and unknown → HTTP JSON envelope.

## Result type (expected failure)

```ts
type Outcome<T, E = ServiceError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

async function loadUser(id: string): Promise<Outcome<User>> {
  try {
    const row = await db.user.findUnique({ where: { id } });
    if (!row) return { ok: false, error: new MissingEntityError('User', id) };
    return { ok: true, value: row };
  } catch {
    return { ok: false, error: new ServiceError('Storage failure', 'DB_ERROR') };
  }
}
```

## Retries

```ts
async function withBackoff<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number; maxMs?: number; retry?: (e: unknown) => boolean } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let delay = opts.baseMs ?? 500;
  const max = opts.maxMs ?? 10_000;
  const retry = opts.retry ?? (() => true);

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === attempts || !retry(e)) throw e;
      await new Promise((r) => setTimeout(r, delay + Math.random() * delay));
      delay = Math.min(delay * 2, max);
    }
  }
  throw new Error('unreachable');
}
```

Retry transient 5xx/timeouts/network — not typical 4xx. Pass cancellation/`AbortSignal` to outbound HTTP.

## User-facing copy

Map `code` → short friendly string; keep codes in API JSON for clients that localize.

## Python

```python
class ServiceError(Exception):
    def __init__(self, message: str, code: str, status_code: int = 500):
        super().__init__(message)
        self.code = code
        self.status_code = status_code

@app.exception_handler(ServiceError)
async def on_service_error(_: Request, exc: ServiceError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": str(exc)}},
    )

@app.exception_handler(Exception)
async def on_unexpected(_: Request, exc: Exception) -> JSONResponse:
    logger.exception("unexpected")
    return JSONResponse(status_code=500, content={
        "error": {"code": "internal_error", "message": "An unexpected error occurred"},
    })
```

Deeper stack conventions: `techne:python`.

## Go

```go
var ErrNotFound = errors.New("not found")

func (r *Repo) ByID(ctx context.Context, id string) (*User, error) {
    row, err := r.db.Query(ctx, id)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, fmt.Errorf("user %s: %w", id, ErrNotFound)
    }
    return row, err
}

func writeDomainError(w http.ResponseWriter, err error) {
    switch {
    case errors.Is(err, ErrNotFound):
        writeJSON(w, 404, map[string]any{"error": map[string]string{"code": "not_found", "message": err.Error()}})
    default:
        slog.Error("handler", "err", err)
        writeJSON(w, 500, map[string]any{"error": map[string]string{"code": "internal_error", "message": "An unexpected error occurred"}})
    }
}
```

Deeper patterns: `techne:go`.

## UI boundary

Server-rendered apps: framework error boundaries for render failures (see `techne:react` / `techne:web` for front-end specifics).

## Circuit breaker (external dependencies)

For flaky third-party APIs: track failure rate in a sliding window; open circuit → fail fast with `503`/`SERVICE_UNAVAILABLE` and structured code; half-open probe after cooldown. Combine with timeouts and bulkheads (separate pool per dependency). Log state transitions.

## Checklist

Every catch handled; API envelope consistent; logs contain context; retries selective; async work awaited or explicitly fire-and-forget with monitoring.
