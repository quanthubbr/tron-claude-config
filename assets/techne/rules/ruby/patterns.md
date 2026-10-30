---
paths:
  - "**/*.rb"
  - "**/*.rake"
  - "**/Gemfile"
  - "**/app/**/*.erb"
  - "**/config/routes.rb"
---
# Ruby Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Rails first

MVC until boundaries blur — then extract named service/query/form objects (verb names, not `Manager`).

## Data store

PostgreSQL for typical multi-host production; SQLite defaults suit single-host — match platform reality. Parameterize all dynamic SQL.

## Jobs

Solid Queue for simple Rails 8 deployments; Sidekiq when Redis ops, throughput, or mature tooling already exist. Solid Cache/Cable vs Redis — match deployment needs.

## UI

Hotwire (Turbo/Stimulus/importmap) for server-rendered apps; SPA/Inertia when complexity or team ownership requires it. No persistence/auth in templates.

## Auth

Rails 8 generator for basic session auth; Devise (or similar) for OAuth/MFA/legacy Devise apps.

Boundaries: `techne:services` skill.
