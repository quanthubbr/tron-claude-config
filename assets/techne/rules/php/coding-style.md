---
paths:
  - "**/*.php"
  - "**/composer.json"
---
# PHP Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Baseline

PSR-12; `declare(strict_types=1);` in new app code; scalar/return/property types everywhere practical.

## Data

Immutable DTOs/value objects at boundaries; `readonly` where supported; promote repeated array shapes to classes.

## Tooling

PHP-CS-Fixer or Laravel Pint; PHPStan/Psalm; Composer scripts identical locally and in CI.

## Imports

Explicit `use` statements; avoid global namespace unless the project standard says otherwise.

## Errors

Exceptions for abnormal flow; validate HTTP input into DTOs before domain code.

Layering: `techne:services` skill; Laravel specifics: `techne:php` skill.
