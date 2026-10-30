# PostgreSQL

## Types

| Need | Use | Skip |
|------|-----|------|
| Surrogate keys | `bigint` | `int` on growing tables; random UUID as PK on write-heavy btree |
| Text | `text` | arbitrary `varchar(n)` caps |
| Instants | `timestamptz` | `timestamp` without zone |
| Money | `numeric(p,s)` | float |
| Flags | `boolean` | int/char sentinels |

## Index map

| Access pattern | Index |
|----------------|-------|
| equality / range on scalar | B-tree (default) |
| `jsonb @>` containment | GIN on column |
| full-text `@@` | GIN on `tsvector` |
| append-only time series | BRIN on time column |

Composite: equality columns left, range/sort right. Partial indexes shrink hot paths (`WHERE deleted_at IS NULL`). Covering: `INCLUDE (cols…)` to skip heap fetches.

## Snippets

```sql
-- RLS: wrap volatile auth helpers in SELECT so planner caches per statement
CREATE POLICY tenant_rows ON orders
  USING ((SELECT app.current_user_id()) = user_id);

INSERT INTO prefs (user_id, k, v)
VALUES (42, 'theme', 'dark')
ON CONFLICT (user_id, k) DO UPDATE SET v = EXCLUDED.v;

SELECT * FROM items
WHERE id > $cursor
ORDER BY id
LIMIT 20;

UPDATE jobs SET state = 'running'
WHERE id = (
  SELECT id FROM jobs WHERE state = 'queued'
  ORDER BY enqueued_at LIMIT 1
  FOR UPDATE SKIP LOCKED
) RETURNING *;
```

## Diagnostics

```sql
-- FK columns missing supporting indexes
SELECT conrelid::regclass AS tbl, a.attname AS col
FROM pg_constraint c
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = ANY (i.indkey)
  );

SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

SELECT relname, n_dead_tup, last_vacuum
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;
```

Enable `pg_stat_statements`. Tune `work_mem`, `statement_timeout`, `idle_in_transaction_session_timeout`. Revoke default public schema grants when hardening.
