---
paths:
  - "**/*.rb"
  - "**/*.rake"
  - "**/Gemfile"
  - "**/Gemfile.lock"
  - "**/config/routes.rb"
---
# Ruby Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS`.

## PostToolUse

- **RuboCop** (`bundle exec rubocop -A` or project script)
- **Brakeman** after security-sensitive Rails edits
- Narrowest **bin/rails test** / **rspec** for touched paths
- **bundle-audit** when Gemfile/lock changes (if installed)

## Warnings

Debug helpers (`binding.pry`, `debugger`, `puts`) in app code; CSRF off; unsafe mass assignment; raw SQL.

## CI (use what exists)

```bash
bundle exec rubocop
bundle exec brakeman --no-progress
bin/rails test
bundle exec rspec
```
