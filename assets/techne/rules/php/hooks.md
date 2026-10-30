---
paths:
  - "**/*.php"
  - "**/composer.json"
  - "**/phpstan.neon"
  - "**/phpstan.neon.dist"
  - "**/psalm.xml"
---
# PHP Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS`.

## PostToolUse

- **Pint** / PHP-CS-Fixer on edited PHP
- **PHPStan** / **Psalm** when configured
- Targeted **PHPUnit** / **Pest** when behavior changes

## Warnings

- `var_dump`, `dd`, `dump`, `die()` left in edits
- Raw SQL strings or disabled CSRF/session guards
