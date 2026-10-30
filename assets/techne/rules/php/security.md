---
paths:
  - "**/*.php"
  - "**/composer.lock"
  - "**/composer.json"
---
# PHP Security

> Builds on the shared rules in `../common/security.md`.

## I/O

Validate at framework boundary; escape template output by default; treat headers/cookies/uploads as untrusted.

## Database

Prepared statements / query builder; careful mass-assignment allow lists.

## Secrets

Env or secret manager; `composer audit` in CI; deliberate version pins.

## Sessions

`password_hash` / `password_verify`; regenerate session id on login/privilege change; CSRF on state-changing web forms.

Framework hardening: `techne:php` skill.
