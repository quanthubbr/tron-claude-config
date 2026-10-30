---
paths:
  - "**/*.fs"
  - "**/*.fsx"
  - "**/*.fsproj"
  - "**/appsettings*.json"
---
# F# Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

Configuration keys or env — fail if missing; no committed credentials.

## SQL

Parameterized queries only (ADO/Dapper/EF).

## Validation

Single-case DU wrappers (`ValidatedEmail`) created at boundaries.

## Auth

Use ASP.NET auth middleware/policies; no token logging.

## Errors

Generic client messages; detailed structured logs server-side.

Review: `security-review` skill / `exo-security` agent.
