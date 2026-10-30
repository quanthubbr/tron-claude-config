# Migrations (cross-engine)

## Principles

- Versioned files are the source of truth; production never gets manual SQL patches.
- Ship fixes forward; do not edit migrations that already ran anywhere shared.
- DDL migrations separate from data backfills.
- Prove migrations against production-scale copies—empty dev DBs hide lock time.
- Checklist before merge: nullable/default for new columns, concurrent indexes where supported, backfill plan, documented irreversible steps.

## PostgreSQL DDL

```sql
-- Safe add
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT true; -- PG11+ fast default

-- Unsafe on big tables
-- ALTER TABLE users ADD COLUMN role TEXT NOT NULL; -- full rewrite + lock

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email ON users (email);
-- CONCURRENTLY cannot run inside a single transaction block
```

Rename via expand–contract: add `display_name`, backfill, deploy dual-write, switch reads, drop `username` later.

Backfill in loops:

```sql
DO $$
DECLARE batch INT := 10000; touched INT;
BEGIN
  LOOP
    UPDATE users SET norm_email = lower(email)
    WHERE id IN (
      SELECT id FROM users WHERE norm_email IS NULL
      LIMIT batch FOR UPDATE SKIP LOCKED
    );
    GET DIAGNOSTICS touched = ROW_COUNT;
    EXIT WHEN touched = 0;
    COMMIT;
  END LOOP;
END $$;
```

Drop columns only after application code no longer references them (Django: `SeparateDatabaseAndState` to decouple model from immediate `DROP`).

## Expand–contract timeline

```
EXPAND: add nullable column → deploy writers to old+new → backfill
MIGRATE: deploy readers on new, writers still dual
CONTRACT: deploy new-only → drop old column in later migration
```

## Tooling

| Tool | Dev | Prod apply |
|------|-----|--------------|
| Prisma | `npx prisma migrate dev --name …` | `npx prisma migrate deploy` |
| Drizzle | `drizzle-kit generate` | `drizzle-kit migrate` (avoid `push` outside solo dev) |
| Kysely | `kysely migrate make …` | `kysely migrate latest` — use `Kysely<any>` in files |
| Django | `makemigrations` / `migrate` | same; empty migration for raw SQL |
| golang-migrate | `migrate create …` | `migrate … up` |

Prisma custom SQL: `migrate dev --create-only`, hand-write `CREATE INDEX CONCURRENTLY`.

Kysely migrator example:

```typescript
import { Migrator, FileMigrationProvider } from 'kysely';
import { promises as fs } from 'fs';
import path from 'path';

const migrator = new Migrator({
  db,
  provider: new FileMigrationProvider({ fs, path, migrationFolder: './migrations' }),
});
const { error } = await migrator.migrateToLatest();
if (error) process.exit(1);
```

Django data migration: `RunPython` with batched `bulk_update`, not one giant loop in memory.

## Anti-patterns

| Bad | Fix |
|-----|-----|
| NOT NULL column without default on populated table | nullable → backfill → set NOT NULL |
| inline index create on huge live table | concurrent index migration |
| DDL + mass UPDATE together | split migrations |
| drop column before deploy removes usage | code first, DDL later |

Prisma: checksums block edited migration folders—add a new migration instead (`P3006`).
