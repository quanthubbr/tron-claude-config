---
paths:
  - "**/*.java"
---
# Java Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

Environment or secret manager — never literals in source. Fail fast when required vars missing.

## SQL

Parameterized APIs only (`PreparedStatement`, JDBC template, ORM bind params). No string-concatenated user input.

## Input

Validate at boundaries; Bean Validation on DTOs when the stack provides it.

## Auth

Use established libraries; bcrypt/Argon2 for passwords; authorize in services; never log secrets or PII.

## Dependencies

Audit tree (`mvn dependency:tree`, `./gradlew dependencies`); CVE scanners; keep deps current without auto-merging bumps.

## Client errors

Generic messages outward; detailed logs server-side — no stack traces or SQL in responses.

Review: `security-review` skill / `exo-security` agent. Framework notes: `techne:java` skill.
