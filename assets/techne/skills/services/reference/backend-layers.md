# Backend layers and infrastructure patterns

## REST handler shape

Resource URLs, query filters, pagination params at the edge; business rules in services.

```ts
interface OrderRepo {
  list(filter: ListFilter): Promise<Order[]>;
  byId(id: string): Promise<Order | null>;
  insert(dto: CreateOrder): Promise<Order>;
}

class OrderService {
  constructor(private repo: OrderRepo) {}
  async search(q: string, limit = 20) {
    const ids = await this.vectorIndex.search(q, limit);
    const rows = await this.repo.byIds(ids);
    return rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }
}
```

## Middleware

Compose cross-cutting concerns (auth, logging, rate limit) as wrappers or framework middleware; attach user/context before the handler runs.

## Database

- Project columns explicitly — avoid `SELECT *` in hot paths.
- Batch related lookups (map by id) instead of per-row queries in loops.
- Multi-step invariants: DB transaction or RPC — single commit/rollback boundary.

## Caching

Decorator/wrapper repo: read Redis → on miss load DB → `SETEX` with TTL; delete key on writes.

## Background work

Queue jobs from HTTP handlers when work is slow or unreliable; return `202`/accepted semantics if the API contract allows. In-process queues OK for dev only — production uses durable queues (`techne:delivery`).

## Auth helpers

Verify bearer JWT with explicit secret/config; map claims to a typed user; RBAC via role → permission table checked in services.

## Logging

Structured JSON logs: `timestamp`, `level`, `message`, `requestId`, `userId`, error fields. Never log secrets or raw tokens.

## Rate limiting

Implement at API gateway, Redis sliding window, or platform limiter — not in-memory per Node instance when horizontally scaled.

## Next.js / Express wiring

```ts
export function withAuth(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return NextResponse.json({ error: { code: 'unauthorized', message: 'Missing token' } }, { status: 401 });
    try {
      const user = await verifyAccessToken(token);
      return handler(req, { ...ctx, user });
    } catch {
      return NextResponse.json({ error: { code: 'unauthorized', message: 'Invalid token' } }, { status: 401 });
    }
  };
}
```

GraphQL APIs: same layering — resolvers stay thin; batch loaders kill N+1 (`DataLoader` pattern). Depth/complexity limits at the gateway.

## Simple in-process queue (dev only)

```ts
class MemoryQueue<T> {
  private q: T[] = [];
  private busy = false;
  enqueue(item: T) {
    this.q.push(item);
    if (!this.busy) void this.drain();
  }
  private async drain() {
    this.busy = true;
    while (this.q.length) {
      const job = this.q.shift()!;
      try { await this.handle(job); } catch (e) { logger.error('job_failed', e); }
    }
    this.busy = false;
  }
  protected async handle(_job: T) { /* override */ }
}
```

Production: durable queue + worker process (`techne:delivery`).
