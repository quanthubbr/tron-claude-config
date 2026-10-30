---
name: databases
description: PostgreSQL, MySQL/MariaDB, ClickHouse, Redis, Prisma, and migration safety for production data layers. Use for schema design, slow queries, indexing, RLS, replication lag, OLAP ingest, caching, locks, rate limits, or ORM/migration tooling.
---

Relational OLTP (Postgres, MySQL/MariaDB), analytics (ClickHouse), cache/coordination (Redis), and TypeScript ORM workflows (Prisma) plus cross-engine migration discipline. Load **reference/** topics on demand; use **biblos** MCP for vendor API drift and **atlas** MCP to locate existing data-access code before editing.

## Non-negotiable rules

1. **Migrations only** — no ad-hoc DDL/DML on production; never rewrite a migration after it has shipped (add a new forward migration).
2. **Forward-only in prod** — undo mistakes with a new migration, not by rolling back history on shared environments.
3. **Separate schema from data** — one migration for DDL, another for backfills; batch updates (thousands of rows per commit), not whole-table locks.
4. **Expand–contract** — add nullable/defaulted columns, dual-write in app, backfill, switch reads, then drop old columns; never rename-in-place on live traffic.
5. **Indexes on large Postgres tables** — `CREATE INDEX CONCURRENTLY` outside transaction blocks; index every FK and predicate used in joins, filters, or sorts.
6. **Pagination** — keyset/cursor on hot lists; avoid deep `OFFSET` on large tables (MySQL and Postgres).
7. **Transactions** — short scope, consistent lock order, indexed `WHERE` on mutating statements; external HTTP/email **outside** DB transactions (including Prisma interactive `$transaction`).
8. **Replicas** — treat lag as normal; pin read-after-write, auth, checkout, and idempotency reads to the primary.
9. **Credentials** — least-privilege app users, TLS on cross-host links, secrets in a manager (not repo); separate admin/migration principals from runtime.
10. **Connection pools** — one ORM client singleton per process; recycle below server `wait_timeout` / idle limits; `pre_ping` or equivalent; serverless often needs `connection_limit=1` plus an external pooler.
11. **Prisma** — `migrate deploy` in CI/staging/prod; `migrate dev` only on disposable local DBs; `updateMany`/`deleteMany` return counts; set `updatedAt` manually on bulk updates; always pass `where` to `deleteMany`.
12. **Redis** — TTL on every key; `SCAN` cursors instead of `KEYS`; multi-step correctness via Lua or `MULTI`/`EXEC`; prefer Streams over Pub/Sub when delivery must survive restarts.
13. **ClickHouse** — MergeTree family with time partitions; filter partition/`ORDER BY` columns first; bulk inserts (JSONEachRow batches), not per-row loops; denormalize instead of heavy join chains in dashboards.
14. **Engine dialect** — run `SELECT VERSION()` (MySQL/MariaDB) before upsert syntax, `SKIP LOCKED` queue patterns, or replica status commands; `SKIP LOCKED` only for worker queues, not financial consistency reads.
15. **Review** — schema/auth/PII exposure → **security-review** skill or **exo-security** agent; API layer coupling → **techne:services** skill.

## References

| File | Load when |
|------|-----------|
| [reference/postgres.md](reference/postgres.md) | Postgres types, indexes (B-tree/GIN/BRIN), partial/covering indexes, RLS, UPSERT, queue `SKIP LOCKED`, `pg_stat_statements`, bloat checks |
| [reference/mysql.md](reference/mysql.md) | InnoDB schema defaults, `EXPLAIN` signals, upsert dialect split, JSON generated columns, FT search, deadlocks, pools, slow log, replication |
| [reference/clickhouse.md](reference/clickhouse.md) | Engine choice, partitions/order keys, MVs, bulk/stream ingest, `system.query_log`, analytics SQL (funnels, cohorts), ETL/CDC notes |
| [reference/migrations.md](reference/migrations.md) | Safety checklist, Postgres DDL patterns, expand–contract timeline, Prisma/Drizzle/Kysely/Django/golang-migrate workflows |
| [reference/prisma.md](reference/prisma.md) | Schema IDs/indexes, `select` vs `include`, transactions, pagination, soft delete, error codes, serverless pooling, common traps |
| [reference/redis.md](reference/redis.md) | Structure picker, cache-aside/write-through, tag invalidation, rate limits, locks, Pub/Sub vs Streams, key naming, eviction |
