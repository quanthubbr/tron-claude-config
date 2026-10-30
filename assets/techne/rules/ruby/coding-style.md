---
paths:
  - "**/*.rb"
  - "**/*.rake"
  - "**/Gemfile"
  - "**/*.gemspec"
  - "**/config.ru"
---
# Ruby Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Runtime

Target Ruby 3.3+ on new Rails apps; respect an existing pin to an older supported release. Enable YJIT in production only after measuring memory and throughput.

## Files

`# frozen_string_literal: true` when the repo uses it; keep metaprogramming behind small, tested APIs.

## Lint

Project RuboCop config (Rails 8+ often starts from omakase); run via binstub:

```bash
bundle exec rubocop
bundle exec rubocop -A
```

Narrow inline disables only with justification.

## Rails

MVC conventions first; thin controllers; domain in models/services/query/form objects as complexity demands; prefer `bin/rails` / binstubs.

## Errors

Rescue specific exceptions; log operations — no committed `puts`/`debugger`.

Layering: `techne:services` skill.
