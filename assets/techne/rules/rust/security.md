---
paths:
  - "**/*.rs"
---
# Rust Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

`std::env::var` at startup; `.gitignore` for local env files; no const secrets.

## SQL

Bound parameters via sqlx/diesel/sea-orm — never format user input into SQL strings.

## Validation

Newtypes + parse-at-boundary; reject early with typed errors.

## Unsafe

Minimal blocks; mandatory `// SAFETY:` listing invariants; review every `unsafe`.

## Dependencies

`cargo audit`, `cargo deny check`, `cargo tree`; keep deps lean and updated.

## Responses

Generic client errors; `tracing` for server detail.

Review: `security-review` skill / `exo-security` agent. Idioms: `techne:rust` skill.
