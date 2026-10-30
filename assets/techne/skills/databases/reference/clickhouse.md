# ClickHouse (OLAP)

Columnar OLAP: optimize for scans, aggregates, and batch load—not row-by-row OLTP. Migrate analytics off Postgres/MySQL when dashboards hammer relational replicas.

## Engines

**MergeTree** — default fact table:

```sql
CREATE TABLE metrics_daily (
  day Date,
  entity_id String,
  volume UInt64,
  events UInt32,
  recorded_at DateTime
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(day)
ORDER BY (day, entity_id)
SETTINGS index_granularity = 8192;
```

**ReplacingMergeTree** — dedupe by sort key (async merges; avoid `FINAL` in hot queries). **AggregatingMergeTree** — store `-State` columns, query with `-Merge` combinators for rollups.

## Query shape

Filter partition key and leading `ORDER BY` columns before high-cardinality predicates:

```sql
SELECT day, entity_id, sum(volume) AS vol, uniq(user_id) AS users
FROM events
WHERE day >= today() - 7 AND entity_id = 'e-9'
GROUP BY day, entity_id
ORDER BY day DESC;
```

Use `quantile()` for percentiles. Window functions for running totals when needed.

## Ingest

```typescript
import { createClient } from '@clickhouse/client';

const ch = createClient({ url: process.env.CH_URL! });

export async function pushBatch(rows: Row[]) {
  await ch.insert({
    table: 'events',
    values: rows.map((r) => ({
      id: r.id,
      entity_id: r.entityId,
      amount: r.amount,
      ts: r.at.toISOString(),
    })),
    format: 'JSONEachRow',
  });
}
```

Target thousands+ rows per insert; stream large feeds with `Readable.from(asyncIterable)`.

## Materialized views

Pipe raw inserts into an aggregate table:

```sql
CREATE MATERIALIZED VIEW hourly_vol_mv TO hourly_vol AS
SELECT
  toStartOfHour(ts) AS hour,
  entity_id,
  sumState(amount) AS amt_state,
  uniqState(user_id) AS users_state
FROM events
GROUP BY hour, entity_id;
```

Query with `sumMerge(amt_state)`, etc.

## Monitoring

```sql
SELECT query_id, query_duration_ms, read_rows, memory_usage
FROM system.query_log
WHERE type = 'QueryFinish' AND query_duration_ms > 1000
  AND event_time >= now() - INTERVAL 1 HOUR
ORDER BY query_duration_ms DESC LIMIT 10;

SELECT database, table, formatReadableSize(sum(bytes)) AS sz, sum(rows) AS rows
FROM system.parts WHERE active
GROUP BY database, table ORDER BY sum(bytes) DESC;
```

## Design checklist

- Partition by month/day; avoid exploding partition count.
- Put high-selectivity filter columns early in `ORDER BY`.
- Prefer `LowCardinality(String)` and smallest unsigned ints that fit.
- List columns explicitly; denormalize facts used together; limit join depth.
- Batch inserts; pre-aggregate via MVs for dashboard latency.

## Pipelines

Scheduled ETL: extract from OLTP → transform to CH row shape → bulk load. CDC/listener patterns can append change rows into a staging MergeTree; treat external notification payloads as untrusted when decoding.
