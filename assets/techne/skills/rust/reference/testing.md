# Rust testing

## TDD loop

1. Add `#[test]` (or `proptest!`) against the public API.
2. Stub body with `todo!()` until failure is meaningful.
3. Implement minimally; run `cargo test` and `clippy`.
4. Refactor without shrinking behavior coverage.

Org-wide verification habits → **techne:quality**.

## Unit tests in-module

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_blank_title() {
        let err = Item::new("", 10).unwrap_err();
        assert!(err.to_string().contains("title"));
    }
}
```

Return `Result<(), E>` from tests to use `?` on setup helpers.

## Panics vs Results

Prefer asserting `is_err()` and matching error enums. Reserve `#[should_panic(expected = "...")]` for truly unreachable internal invariants.

## Integration tests

Each file under `tests/` is its own crate—import the library by name:

```rust
use mylib::{App, Settings};

#[test]
fn health_endpoint_returns_ok() {
    let app = App::boot(Settings::fixture());
    let resp = app.get("/health").unwrap();
    assert_eq!(resp.status, 200);
}
```

Share helpers via `tests/common/mod.rs` (not `tests/common.rs` alone if multiple binaries need it).

## Async

```rust
#[tokio::test]
async fn times_out_on_slow_peer() {
    let result = tokio::time::timeout(
        Duration::from_millis(50),
        client.fetch("/slow"),
    ).await;
    assert!(result.is_err());
}
```

Use `tokio::test` with multi-thread runtime when tests spawn tasks.

## Parameterized tests

**rstest** for readable matrices:

```rust
#[rstest]
#[case("", false)]
#[case("ok", true)]
fn validates_token(#[case] token: &str, #[case] ok: bool) {
    assert_eq!(check(token).is_ok(), ok);
}
```

**proptest** for invariants:

```rust
proptest! {
    #[test]
    fn roundtrip(bytes in prop::collection::vec(any::<u8>(), 0..256)) {
        let enc = encode(&bytes);
        prop_assert_eq!(decode(&enc).unwrap(), bytes);
    }
}
```

Custom strategies for emails, IDs, or bounded numerics.

## mockall

```rust
#[automock]
trait Repo {
    fn fetch(&self, id: u64) -> Option<Row>;
}

#[test]
fn returns_row_when_present() {
    let mut mock = MockRepo::new();
    mock.expect_fetch().with(eq(7)).returning(|_| Some(Row { id: 7 }));
    let svc = Service::new(mock);
    assert_eq!(svc.load(7).unwrap().id, 7);
}
```

Do not mock types you do not own—wrap behind your trait.

## Doc tests

Executable examples in `///` blocks; use `no_run` when I/O required. They run via `cargo test --doc`.

## Benchmarks (Criterion)

`[[bench]]` with `harness = false`; use `black_box` on inputs; commit baseline HTML only when team agrees.

## Coverage

```bash
cargo llvm-cov
cargo llvm-cov --html
cargo llvm-cov --fail-under-lines 80
```

Coverage goals: domain core 100%, exported API at least 90%, everything else at least 80%; leave generated code and FFI shims out of the measurement.

## CI sketch

Format check → Clippy → tests → llvm-cov threshold. Pin toolchain via `rust-toolchain.toml` or CI action.

## Practices

| Do | Skip |
|----|------|
| Independent tests | Shared `static mut` |
| Descriptive `snake_case` test names | Testing private functions directly |
| Property tests on parsers/crypto | Sleeping for timing—use mocks or `pause` |
| `cargo test -- --nocapture` while debugging | Ignored flaky tests without ticket |

Untrusted deserialization → combine proptest with **security-review**.
