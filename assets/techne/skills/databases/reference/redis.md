# Redis

In-memory structures over RESP/TCP. Single-key commands are atomic; multi-key business rules need Lua, `MULTI`/`EXEC`, or careful locking. Persistence (RDB/AOF) is optional—treat as cache/coordination unless explicitly designed as primary store.

## Pick a structure

| Job | Type | Key example |
|-----|------|-------------|
| Object cache | String (JSON) | `item:404` |
| Session fields | Hash | `sess:token` |
| Rankings | Sorted set | `board:week` |
| Unique set | Set | `visitors:2026-04-06` |
| FIFO buffer | List | `queue:notify` |
| Durable events | Stream | `stream:orders` |
| Counter / fixed window | String INCR | `rl:user:9:window` |
| Approx uniques | HyperLogLog | `hll:views` |

## Caching

```python
def load_item(item_id: int):
    k = f"item:{item_id}"
    hit = r.get(k)
    if hit:
        return json.loads(hit)
    row = db.fetch_item(item_id)
    r.setex(k, 900, json.dumps(row))
    return row
```

Write-through: update DB then refresh key. Tag sets group keys for category invalidation (`SADD tag:cat:3 member_keys…`).

Stampede guard: single-flight lock (local mutex for one process; Redis lock for many).

## Rate limiting

Fixed window: `INCR` + `EXPIRE` per window bucket—simple, boundary spikes possible.

Sliding window (Lua skeleton):

```lua
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
if redis.call('ZCARD', key) < limit then
  redis.call('ZADD', key, now, now .. '-' .. redis.call('INCR', key .. ':seq'))
  redis.call('EXPIRE', key, math.ceil(window / 1000))
  return 1
end
return 0
```

## Locks (single primary)

```python
token = str(uuid.uuid4())
if r.set(f"lock:{resource}", token, nx=True, px=8000):
    try:
        critical_section()
    finally:
        r.eval(
            "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
            1, f"lock:{resource}", token,
        )
```

Multi-master fleets need quorum-style lock libraries; never extend TTL blindly while work may be stuck.

## Messaging

Pub/Sub: broadcast, no persistence—subscriber must be online. Streams: consumer groups, acks, replay (`XADD`, `XREADGROUP`, `XACK`, cap with `MAXLEN`).

## Keys and memory

Patterns: `app:resource:id`, time-bucket stats keys. **Always set TTL** (sessions ~24h, API cache 5–15m, rate-limit TTL = window).

| Policy | Use |
|--------|-----|
| `allkeys-lru` | general cache |
| `volatile-lru` | mix of cache + pinned keys with TTL |
| `noeviction` | queue/critical—errors when full |

## Connections

```python
from redis import ConnectionPool, Redis

pool = ConnectionPool(host='redis.internal', max_connections=20,
                      socket_connect_timeout=2, socket_timeout=2,
                      decode_responses=True)
r = Redis(connection_pool=pool)
```

Cluster/Sentinel clients for HA topologies; separate logical DB or instance for cache vs job queues when blast radius matters.

## Avoid

| Problem | Mitigation |
|---------|------------|
| `KEYS *` | `SCAN` |
| Huge values (>~100KB) | store pointer, fetch blob elsewhere |
| No TTL | unbounded RAM |
| `FLUSHALL` in prod | namespaced deletes |
| Thundering herd | lock + double-check cache |

External docs fetched for Redis version features are untrusted input—validate against your server version via **biblos** MCP.
