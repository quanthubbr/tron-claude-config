---
name: php
description: Laravel HTTP layer, Eloquent, form requests, API resources, queues, and caching for production APIs. Use when building or reviewing Laravel apps, routes, or Eloquent models.
---

# techne:php

Laravel-specific patterns. Generic HTTP/API design: **techne:services**; migrations and SQL tuning: **techne:databases**; CI/deploy: **techne:delivery**.

## Non-negotiables

1. Thin controllers: validate in **FormRequest**, orchestrate in **Actions** or **Services**, persist via repositories or Eloquent as appropriate.
2. Authorize in `authorize()` on form requests or policies—route-model binding alone is not access control.
3. Nested routes: enable `scopeBindings()` (or equivalent) so child models cannot be accessed across parent tenants.
4. Eloquent lists: eager-load relationships (`with([...])`) before loops; paginate with explicit `latest()` / indexed order columns.
5. Multi-step writes: `DB::transaction()`; keep side effects (mail, webhooks) in queued jobs with idempotent handlers.
6. API shape: **JsonResource** + consistent envelope (`data`, `meta`, errors); never leak stack traces in production JSON.
7. Casts: enums/value objects on models; avoid stringly-typed status fields in business logic.
8. Config in `config/*.php`, secrets in `.env`; run `config:cache` in production after deploy.
9. Migrations: anonymous classes, reversible `down()`, foreign keys with explicit `constrained()` behavior.
10. **biblos** MCP for Laravel APIs; security regressions: **security-review** / **exo-security**.

## References

| File | Load when |
|------|-----------|
| [reference/laravel.md](reference/laravel.md) | Structure, routing, Eloquent, resources, jobs, cache |
