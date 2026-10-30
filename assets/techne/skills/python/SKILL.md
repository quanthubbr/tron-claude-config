---
name: python
description: Python idioms, pytest, Django/DRF, and FastAPI patterns for typed, testable backends. Use when writing or reviewing Python services, ORM/API layers, or pytest suites.
---

# techne:python

Covers general Python style, pytest strategy, Django (including DRF), and FastAPI. For cross-stack API design, errors, and hexagonal boundaries see **techne:services**; databases and migrations see **techne:databases**; TDD and browser QA see **techne:quality**.

## Non-negotiables

1. Type-annotate public functions and data crossing module boundaries; enforce with mypy (or pyright) in CI.
2. Ship `src/` layout + `pyproject.toml`; pin Python with `requires-python`; run **ruff** (lint + import sort) and **black** (or ruff format) before merge.
3. Catch specific exceptions only; wrap domain failures in a small hierarchy; always chain with `raise ... from exc`.
4. Release files, sockets, and DB sessions via `with` / async context managers; roll back failed transactions explicitly.
5. No mutable defaults (`def f(x, items=None)`); compare singletons with `is`; prefer `isinstance` over `type() ==`.
6. Unit tests: mock outbound HTTP, email, and payment clients; keep tests independent; name tests by behavior.
7. Aim ≥80% line coverage; auth, billing, and permission paths require full branch coverage.
8. Mark `@pytest.mark.integration` / `slow`; default CI runs `pytest -m "not slow"`.
9. **Django**: split settings (`base` / `dev` / `prod` / `test`); list endpoints must `select_related` / `prefetch_related`; put multi-step rules in services + `@transaction.atomic`.
10. **FastAPI**: routers stay thin; mutations live in services; use Pydantic v2 response models; async routes need async SQLAlchemy (no blocking ORM in `async def`).
11. Production Django: `DEBUG=False`, secure cookies, HSTS; prod FastAPI schema changes via Alembic—not ad-hoc `create_all`.
12. Library/API details: **biblos** MCP; repo structure: **atlas** MCP.
13. Security-sensitive endpoints: **security-review** skill or **exo-security** agent before merge.

## References

| File | Load when |
|------|-----------|
| [reference/python-core.md](reference/python-core.md) | Typing, errors, concurrency, packaging, tooling |
| [reference/python-testing.md](reference/python-testing.md) | pytest fixtures, mocks, async tests, coverage |
| [reference/django.md](reference/django.md) | Models, DRF, caching, signals, ORM performance |
| [reference/fastapi.md](reference/fastapi.md) | App factory, DI, Pydantic v2, services, httpx tests |
