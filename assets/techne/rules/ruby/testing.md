---
paths:
  - "**/*.rb"
  - "**/*.rake"
  - "**/Gemfile"
  - "**/test/**/*.rb"
  - "**/spec/**/*.rb"
  - "**/config/routes.rb"
---
# Ruby Testing

> Builds on the shared rules in `../common/testing.md`.

## Framework

Minitest when that is the app default; RSpec when established — do not mix in one feature without a migration plan.

## Pyramid

Model/service/job/policy unit tests; request specs for HTTP/auth/status; system tests only for critical browser flows; job unit + enqueue integration.

## Data

Fixtures for small graphs; factory_bot when traits/composition matter.

```bash
bin/rails test
bundle exec rspec
```

## Coverage

SimpleCov thresholds in CI; regression test before fixing production bugs.

Loop: `techne:quality` skill.
