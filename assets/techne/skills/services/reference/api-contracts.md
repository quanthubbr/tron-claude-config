# REST API contracts

## URLs and methods

```
GET    /api/v1/orders
GET    /api/v1/orders/:id
POST   /api/v1/orders
PATCH  /api/v1/orders/:id
DELETE /api/v1/orders/:id
POST   /api/v1/orders/:id/cancel   # non-CRUD actions — verbs sparingly
```

Plural kebab-case nouns; no `/getOrders`. Sub-resources express ownership: `/users/:id/orders`.

## Status codes

| Code | When |
|------|------|
| 200 | GET/PATCH with body |
| 201 | POST create + `Location` |
| 204 | DELETE success, no body |
| 400 | Malformed JSON |
| 401 | Missing/invalid auth |
| 403 | Authenticated, forbidden |
| 404 | Missing resource |
| 409 | Conflict / duplicate |
| 422 | Valid JSON, invalid semantics |
| 429 | Rate limited + `Retry-After` |
| 503 | Overload + `Retry-After` |

Never encode failure only in JSON while returning HTTP 200.

## Envelopes

Public APIs often wrap:

```json
{ "data": { … }, "meta": { "page": 1, "per_page": 20, "total": 142 } }
```

Errors:

```json
{
  "error": {
    "code": "validation_error",
    "message": "…",
    "details": [{ "field": "email", "message": "…", "code": "invalid_format" }]
  }
}
```

Internal APIs may return raw resources on success if status codes disambiguate.

## Pagination

| Style | When |
|-------|------|
| Offset `page`/`per_page` | Admin UIs, small tables, search with page numbers |
| Cursor `cursor` + `limit` | Feeds, large tables, public APIs |

Cursor: fetch `limit+1` to compute `has_next`; opaque cursor encoding.

## Filtering and sorting

Equality filters as query params; ranges via bracket notation (`price[gte]=10`); sort `sort=-created_at,name`; sparse fieldsets `fields=id,name`.

## Auth headers

`Authorization: Bearer …` for users; `X-API-Key` for service accounts when documented.

Resource auth: load entity, compare `order.userId` to caller; admin routes behind role guard **and** service check.

## Versioning

Start at `/api/v1`. Maintain at most two active versions. Breaking changes → new version; additive response fields / optional params → same version. Deprecate with `Sunset` header and timeline; eventually `410 Gone`.

## Rate limit headers

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1700000000
```

Typical tiers: anonymous per IP, authenticated per user, elevated per API key — tune to product policy.

## Ship checklist

Naming, method, status, schema validation, error shape, pagination on lists, authn/authz, rate limits, no leak of internals, OpenAPI updated, naming convention consistent (snake_case vs camelCase — pick one).

## Handler examples

### TypeScript (Next.js route)

```ts
const bodySchema = z.object({ email: z.string().email(), name: z.string().min(1).max(100) });

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({
      error: {
        code: 'validation_error',
        message: 'Invalid body',
        details: parsed.error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      },
    }, { status: 422 });
  }
  const user = await users.create(parsed.data);
  return NextResponse.json({ data: user }, {
    status: 201,
    headers: { Location: `/api/v1/users/${user.id}` },
  });
}
```

### Conflict mapping

Duplicate unique key → `409` with `code: 'email_taken'` (or domain-specific code), not `500`.

### List endpoint

Always cap `per_page` (e.g. max 100); default sort documented; filter whitelist to indexed columns where possible (`techne:databases` for index strategy).

### Python (DRF-style)

Separate write serializer from read serializer; `create` returns `201` + `Location`; validation errors become `400`/`422` with field keys — align JSON keys with TypeScript clients if both exist.

### Go `net/http`

Decode JSON → validate struct tags/custom `Validate()` → map `domain.Err*` with `errors.Is` → never branch on error string contents.

Framework-specific guides: `techne:python`, `techne:go`, `techne:java` when the stack is fixed.
