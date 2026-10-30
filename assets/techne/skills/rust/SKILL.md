---
name: rust
description: Rust ownership, error types, async/concurrency, and test strategy—unit/integration, tokio, mockall, proptest, Criterion. Use when writing or reviewing Rust crates, binaries, or `cargo test` / Clippy gates.
---

Rust safety comes from types: illegal states should not compile, and failures propagate instead of panicking. Use **atlas** for module graph, **biblos** for crate APIs, **techne:quality** for org-wide verification, **code-review** / **exo-qa** on PRs, and **security-review** / **exo-security** when parsing untrusted input or FFI.

## Non-negotiable rules

1. **Borrow before clone** — take `&T`, `&str`, and slices; clone only when storing or transferring ownership; use `Cow` when mutation is rare.
2. **Libraries: typed errors (`thiserror`); binaries: `anyhow` + context** — propagate with `?`; no `unwrap`/`expect` on production paths; mark fallible returns `#[must_use]`.
3. **States are enums** — match every variant explicitly for domain enums; avoid `_` wildcards that hide new cases.
4. **Thin public API** — `pub(crate)` for internal helpers; re-export stable surface from `lib.rs`; modules grouped by domain.
5. **Iterators and `?` in collections** — prefer adapter chains; `collect` into `Result<Vec<_>, _>` to fail fast.
6. **Concurrency: message passing or `Arc<Mutex<_>>`** — bounded channels for backpressure; Tokio for async I/O; never block the runtime with `thread::sleep`.
7. **`unsafe` only with documented SAFETY invariants** — FFI and proven hot paths; never to silence the borrow checker.
8. **Unit tests live in `#[cfg(test)] mod tests`** — integration tests in `tests/*.rs`; async tests use `#[tokio::test]` with realistic timeouts.
9. **Isolate with traits** — `mockall` for expectations; `proptest` / `rstest` when matrices grow; doc tests on public examples.
10. **CI: `cargo fmt --check`, `clippy -D warnings`, `cargo test`, coverage ≥80% lines** — `cargo audit` on dependencies.
11. **Newtypes for IDs** — wrap primitives so argument order mistakes fail at compile time.
12. **Generics for monomorphized hot paths; `dyn Trait` for plugin lists** — return concrete owned types from public functions when possible.

## References

| File | Load when |
|------|-----------|
| [reference/patterns.md](reference/patterns.md) | Ownership, errors, enums, traits, async, modules, tooling |
| [reference/testing.md](reference/testing.md) | TDD, integration layout, async tests, mocks, property tests, benches, coverage |
