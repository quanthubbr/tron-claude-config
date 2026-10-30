---
paths:
  - "**/*.rs"
---
# Rust Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Repository trait

```rust
pub trait Ledger: Send + Sync {
    fn by_id(&self, id: u64) -> Result<Option<Entry>, StoreErr>;
    fn save(&self, row: &Entry) -> Result<Entry, StoreErr>;
}
```

## Services

Struct + constructor injecting `Box<dyn Ledger>` (or generics); business methods call traits, not concrete DB types.

## Newtypes

Wrap ids (`struct AccountId(u64)`) to prevent argument swaps.

## State enums

Model connection lifecycle as enum; match exhaustively — no catch-all on critical variants.

## Builders

Fluent builder for configs with many optional fields.

## Sealed traits

Private `Sealed` supertrait to block external impls when extension must stay internal.

## JSON envelope

Tagged enum with `serde` for `{ "status": "ok" | "error" }` responses.

Depth: `techne:rust` skill.
