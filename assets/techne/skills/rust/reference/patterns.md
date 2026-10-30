# Rust patterns

## Ownership

Pass borrowed data into read-only algorithms; take `Vec` or owned strings only when retaining them. Skip defensive clones—fix the signature instead.

`Cow<'_, str>` returns borrowed input when unchanged and allocates only on transform.

## Errors

**Crates exposed to others:**

```rust
#[derive(Debug, thiserror::Error)]
pub enum StoreError {
    #[error("missing record {id}")]
    Missing { id: String },
    #[error(transparent)]
    Io(#[from] std::io::Error),
}
```

**Binaries and tools:** `anyhow::Result` with `.context("while loading config")`; use `bail!` for invariant violations.

Prefer `Option` combinators (`and_then`, `map`) over nested `match` when branching stays shallow.

## Modeling with enums

Replace boolean flag piles with variants that carry data (`Connecting { attempt: u32 }`). Match arms should cover business logic per state; use guards (`if *attempt > 3`) instead of extra booleans.

## Traits and types

- Input: `impl Read`, `impl AsRef<str>`, or generic bounds.
- Output: `Vec<u8>`, `String`, or domain structs—not `Box<dyn Error>` in library roots.
- Plugin registries: `Vec<Box<dyn Handler + Send + Sync>>`.
- Newtype wrappers: `struct AccountId(u64);` distinct from `OrderId(u64)`.

Builder-style construction for many optional fields:

```rust
ServerConfig::builder("0.0.0.0", 8080)
    .max_connections(512)
    .build()
```

## Iterators

Filter/map/collect chains beat manual `push` loops for clarity and often performance. Annotate collect targets: `HashMap<_, _>`, `Result<Vec<_>, _>`.

## Concurrency

| Need | Tool |
|------|------|
| Shared counter | `Arc<Mutex<T>>` — handle poison errors |
| Work queue | `mpsc::sync_channel(n)` |
| Parallel async I/O | `tokio::spawn` + `JoinSet` or join handles |
| Time limits | `tokio::time::timeout` |

Document lock ordering when multiple mutexes appear; keep critical sections small.

## Async sketch

```rust
async fn fetch_body(client: &reqwest::Client, url: &str) -> anyhow::Result<String> {
    let resp = tokio::time::timeout(Duration::from_secs(5), client.get(url).send())
        .await
        .context("timeout")??;
    Ok(resp.text().await?)
}
```

## Module layout

```
src/
  lib.rs          # pub use re-exports
  auth/
  billing/
  infra/db.rs
tests/            # black-box integration
benches/          # Criterion when perf matters
```

## Tooling

```bash
cargo check          # fast typecheck
cargo clippy -- -D warnings
cargo fmt
cargo test
cargo test --doc
cargo bench
cargo audit
cargo tree -i duplicate_crate
```

## Anti-patterns

| Avoid | Fix |
|-------|-----|
| `unwrap` on user input | `?` + typed error |
| `String` parameter | `&str` or `impl AsRef<str>` |
| `.clone()` to appease borrow checker | Restructure scopes or take ownership once |
| Wildcard `_` on evolving enums | Explicit arms |
| `Box<dyn Error>` in libraries | `thiserror` enum |
| Blocking sleep inside `async fn` | `tokio::time::sleep(...).await` |

FFI and `unsafe` reviews → **exo-security**.
