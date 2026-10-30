# MySQL / MariaDB

Confirm engine and version first:

```sql
SELECT VERSION();
SHOW VARIABLES LIKE 'version_comment';
```

**Upsert:** MariaDB and mixed fleets → `VALUES(col)` in `ON DUPLICATE KEY UPDATE`. MySQL 8+ row alias (`AS incoming`) when the fleet is MySQL-only. **SKIP LOCKED** → worker dequeue only; not for ledger-style reads.

## Table baseline (InnoDB)

```sql
CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL,
  total DECIMAL(15,2) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_acct_status_created (account_id, status, created_at),
  KEY idx_acct_active (account_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

| Case | Prefer | Avoid |
|------|--------|-------|
| PK | `BIGINT UNSIGNED AUTO_INCREMENT` | `INT` when >2B rows possible |
| UUID lookups | `BINARY(16)` + app encode | `CHAR(36)` PK on hot paths |
| Money | `DECIMAL` | float/double |
| Charset | `utf8mb4` | legacy `utf8`/`utf8mb3` |
| Soft delete | `deleted_at` + scoped index | unindexed `deleted_at IS NULL` filters |
| Status | lookup table or short `VARCHAR` | volatile `ENUM` |

## Plans and indexes

```sql
EXPLAIN
SELECT id, total FROM orders
WHERE account_id = ? AND status = 'pending'
ORDER BY created_at DESC LIMIT 50;
```

Investigate `type=ALL`, missing `key`, huge `rows`, `Using filesort` / `Using temporary`. Keyset page:

```sql
SELECT id, name, created_at FROM products
WHERE (created_at, id) < (?, ?)
ORDER BY created_at DESC, id DESC LIMIT 50;
```

Index `(created_at, id)` to match.

## JSON and search

Store extension fields in `JSON`; promote hot paths to **stored generated** columns and index those. Relational columns stay for FKs, tenancy, lifecycle.

```sql
ALTER TABLE articles ADD FULLTEXT ft_title_body (title, body);
```

Built-in FT is fine for simple search; move to a dedicated search engine for typos, facets, or heavy ranking.

## Transactions

Lock accounts in ascending `id` order; mutate balances; commit quickly. On deadlock: rollback entire attempt with bounded retries; capture `SHOW ENGINE INNODB STATUS\G` promptly.

Queue claim pattern uses `FOR UPDATE SKIP LOCKED` inside a short transaction.

## Pools

Recycle client connections below `wait_timeout` (e.g. server 300s → recycle ~240s). Enable keep-alive / pre-ping. Size pool × app instances ≤ server `max_connections` headroom.

## Ops

```sql
SHOW FULL PROCESSLIST;
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
```

Use `EXPLAIN ANALYZE` only when executing the query is acceptable on that dataset.

## Replication and security

Monitor replica SQL/IO threads and lag, not just TCP up. After writes, sensitive reads stay on primary.

```sql
CREATE USER 'app'@'%' IDENTIFIED BY '<from-secret-manager>';
GRANT SELECT, INSERT, UPDATE, DELETE ON appdb.* TO 'app'@'%';
ALTER USER 'app'@'%' REQUIRE SSL;
```

No empty-name users; no `ALL PRIVILEGES` on app roles; migration user ≠ runtime user.

## Review output

When auditing, state version assumptions, top correctness/lock/security risks, concrete SQL/code fixes, and validation (`EXPLAIN`, migration dry-run, rollback trigger).
