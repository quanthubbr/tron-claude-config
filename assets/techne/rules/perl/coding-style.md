---
paths:
  - "**/*.pl"
  - "**/*.pm"
  - "**/*.t"
  - "**/*.psgi"
  - "**/*.cgi"
---
# Perl Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Baseline

`use v5.36` (strict, warnings, signatures); subroutine signatures — no manual `@_` unpack; `say` over bare `print`.

## Objects

**Moo** + **Types::Standard**; `is => 'ro'` attributes; no blessed hashrefs without accessors.

## Format

**perltidy** (`-i=4`, `-l=100`, `-ce`, `-bar`).

## Lint

**perlcritic** severity 3, themes `core`, `pbp`, `security`:

```bash
perlcritic --severity 3 --theme 'core || pbp || security' lib/
```

Depth: consult `techne:services` for service layering if the app grows beyond scripts.
