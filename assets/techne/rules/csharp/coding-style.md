---
paths:
  - "**/*.cs"
  - "**/*.csx"
---
# C# Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Baseline

Current .NET conventions; nullable reference types on; explicit modifiers on public/internal API; one primary type per file.

## Models

`record` / `record struct` for immutable DTOs; `class` for entities; interfaces at boundaries; no `dynamic` in app code.

## Immutability

`init` accessors, constructor-only mutation, immutable collections for shared state; `with` for updates.

## Async

`async`/`await` only — no `.Result`/`.Wait()`; thread `CancellationToken` through public async methods; log with structured properties; throw specific exceptions.

## Format

`dotnet format`; tidy usings; expression bodies when still readable.

Depth: `techne:dotnet` skill.
