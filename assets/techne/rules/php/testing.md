---
paths:
  - "**/*.php"
  - "**/phpunit.xml"
  - "**/phpunit.xml.dist"
  - "**/composer.json"
---
# PHP Testing

> Builds on the shared rules in `../common/testing.md`.

## Runner

PHPUnit default; Pest only when the repo already standardizes on Pest — do not mix casually.

```bash
vendor/bin/phpunit --coverage-text
```

## Organization

Fast unit vs integration suites; factories/builders over huge arrays; service tests for rules, controller tests for transport.

## Inertia

When used, assert Inertia component/props via framework helpers — not raw JSON alone.

Loop: `techne:quality` skill; Laravel testing: `techne:php` skill.
