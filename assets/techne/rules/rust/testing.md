---
paths:
  - "**/*.rs"
---
# Rust Testing

> Builds on the shared rules in `../common/testing.md`.

## Tools

`#[test]` modules; **rstest** for cases; **proptest** for properties; **mockall** for trait mocks; **`#[tokio::test]`** for async.

## Layout

Unit tests in `#[cfg(test)]` beside code; integration tests under `tests/`; shared helpers in `tests/common/`.

## Mocks

Define traits in production; `mockall::mock!` in test modules with expectations.

## Coverage

~80% with **cargo-llvm-cov**; exclude generated/FFI glue.

```bash
cargo test
cargo llvm-cov --fail-under-lines 80
```

Depth: `techne:rust` skill (testing reference).
