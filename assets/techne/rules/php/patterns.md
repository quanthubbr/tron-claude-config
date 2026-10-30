---
paths:
  - "**/*.php"
  - "**/composer.json"
---
# PHP Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Controllers

HTTP concerns only — auth, validation, status, serialization.

## Services

Business rules in injectable services testable without bootstrapping the full framework.

## DTOs / values

Typed request/response objects; value objects for money, ids, ranges.

## Boundaries

Thin ORM models; adapter wrappers around third-party SDKs.

API shape: `techne:services` skill; Laravel architecture: `techne:php` skill.
