# Prisma (TypeScript)

Run `npx prisma --version` before relying on API details. Newer majors may require driver adapters (`@prisma/adapter-pg`) and config split across `schema.prisma` / `prisma.config.ts`; CLI migrate/generate commands stay familiar.

## Schema

| ID style | When |
|----------|------|
| `@default(cuid())` | default app PK |
| `@default(uuid())` | external systems need UUID |
| `@default(autoincrement())` | internal-only tables |

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  deletedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([deletedAt, createdAt])
}
```

`@unique` already indexes—skip redundant `@@index` on same column. Index FKs and filter/sort fields.

## Client singleton

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForDb = globalThis as { prisma?: PrismaClient };

function buildClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
  });
}

export const prisma = globalForDb.prisma ?? buildClient();
if (process.env.NODE_ENV !== 'production') globalForDb.prisma = prisma;
```

Use direct `new PrismaClient()` when your install does not require an adapter.

## Queries

- **`select`** on hot paths; **`include`** when most scalars plus relations are needed. Benchmark JOIN-style `relationJoins` on wide 1:N graphs.
- Map to response DTOs—never return raw models from HTTP handlers.
- Fix N+1 with relation loads, not per-row queries in loops.

```typescript
const page = await prisma.post.findMany({
  where: { published: true },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit + 1,
  ...(cursor && { cursor: { id: cursor }, skip: 1 }),
});
const hasMore = page.length > limit;
if (hasMore) page.pop();
```

Soft delete: explicit `deletedAt: null` filters; use `findFirstOrThrow` (not `findUniqueOrThrow`) when combining id + soft-delete predicate.

## Transactions

| Case | Pattern |
|------|---------|
| Independent writes | `$transaction([op1, op2])` |
| Read-then-write rules | interactive callback; use `tx` only inside |
| Email/HTTP | outside transaction |

Default interactive timeout ~5s—raise only for bounded bulk work; never await third parties inside.

## Errors

```typescript
import { Prisma } from '@prisma/client';

try {
  await prisma.user.create({ data: { email } });
} catch (err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') throw conflict('email taken');
    if (err.code === 'P2025') throw notFound();
    if (err.code === 'P2003') throw badRequest('bad reference');
  }
  throw err;
}
```

## Traps

- `updateMany` / `deleteMany` → `{ count }`; fetch ids first if you need rows back.
- `@updatedAt` skipped on `updateMany`—set `updatedAt: new Date()` manually.
- `deleteMany()` with no `where` wipes the table.
- `migrate dev` may reset on drift—never on shared DBs; use `migrate deploy` + `migrate diff` for checks.
- Do not edit applied migration SQL (checksum failure).
- Serverless: embed `connection_limit=1` and pooler flags in `DATABASE_URL` (respect existing query string); avoid naive string concat on URLs that already have `?`.

Breaking NOT NULL / renames: multi-step migrations per **reference/migrations.md** expand–contract.
