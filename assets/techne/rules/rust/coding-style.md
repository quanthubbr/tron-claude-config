---
paths:
  - "**/*.rs"
---
# Rust Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Format

`cargo fmt`; `cargo clippy -- -D warnings`; 100-col lines (rustfmt default).

## Immutability

Default `let`; `let mut` only when needed; return new values; `Cow` when borrow vs allocate is conditional.

## Naming

`snake_case` values/modules; `PascalCase` types; `SCREAMING_SNAKE_CASE` consts.

## Borrowing

Prefer `&str`, `&[T]` parameters; `impl Into<String>` when storing owned strings; avoid clone-to-placate the checker without understanding why.

## Errors

`Result` + `?`; libraries: `thiserror`; binaries: `anyhow` + `.context(...)`. No `unwrap` in production paths.

## Iterators vs loops

Chains for transforms; loops when control flow is irregular.

## Modules

Group by domain (`auth/`, `billing/`), not by layer file type.

## Visibility

Private by default; `pub(crate)` for internal API; re-export public surface from `lib.rs`.

Depth: `techne:rust` skill.
