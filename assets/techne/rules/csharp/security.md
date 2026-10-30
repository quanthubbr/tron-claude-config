---
paths:
  - "**/*.cs"
  - "**/*.csx"
  - "**/*.csproj"
  - "**/appsettings*.json"
---
# C# Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

Configuration, user secrets locally, vault in prod — no literals; real credentials never in committed appsettings.

## SQL

Parameterized ADO/Dapper/EF only; whitelist dynamic sort/filter fields.

## Validation

Validate DTOs at the edge (annotations, FluentValidation, guards).

## Auth

Framework handlers and policies; never log tokens/passwords.

## Errors

Safe outward messages; structured server logs without stack/SQL/path leakage.

Review: `security-review` skill / `exo-security` agent.
