---
paths:
  - "**/*.rb"
  - "**/*.rake"
  - "**/Gemfile"
  - "**/Gemfile.lock"
  - "**/config/routes.rb"
  - "**/config/credentials*.yml.enc"
---
# Ruby Security

> Builds on the shared rules in `../common/security.md`.

## Rails defaults

CSRF on; strong parameters or typed params; secrets in credentials/env/vault — never plaintext in git.

## SQL

ActiveRecord/query APIs or bound SQL — never interpolate request/job/webhook data into strings.

## Sessions

Rotate on login/elevation; rate-limit and audit recovery flows.

## Dependencies

```bash
bundle exec bundle-audit check --update
bundle exec brakeman --no-progress
```

Review new gems for maintenance and native extension risk.

## Web

Default HTML escaping; treat `html_safe`/`raw` as security code; validate uploads; treat jobs/cable/turbo streams as untrusted input.

Review: `security-review` skill / `exo-security` agent.
