---
paths:
  - "**/*.fs"
  - "**/*.fsx"
---
# F# Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Baseline

Idiomatic F#; immutability default; small focused modules.

## Domain types

Discriminated unions over deep class trees; records for labeled data; single-case unions for validated primitives.

## Updates

`with` expressions; persistent `list`/`map`/`set`; no mutable domain fields.

## Functions

Small composable functions; pipe `|>` for pipelines; pattern match over nested if/else; `Option` not null; `Result` for expected failures.

## Async

`task { }` for .NET interop; `async { }` for F# workflows; pass `CancellationToken` on public async APIs.

## Format

**fantomas**; trim unused `open`; group opens: System → Microsoft → third-party → project (blank line between groups, sorted within).

Depth: `techne:dotnet` skill.
