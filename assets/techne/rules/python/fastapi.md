---
paths:
  - "**/app/**/*.py"
  - "**/fastapi/**/*.py"
  - "**/*_api.py"
---
# FastAPI Rules

Apply with general Python rules on FastAPI codebases.

## Layout

- Factory: `create_app()` owns wiring.
- Routers: HTTP only; persistence and rules live in services/CRUD helpers.
- Split create / update / response schemas.
- DB sessions and auth via `Depends`.

## Async boundaries

- `async def` routes when work is I/O-bound.
- Async DB/HTTP clients from async handlers.
- No blocking `requests`, sync SQLAlchemy sessions, or sync disk/network in async routes.

## Injection

```python
@router.get("/accounts/{account_id}")
async def fetch_account(
    account_id: str,
    session: AsyncSession = Depends(get_session),
    principal: User = Depends(current_user),
):
    ...
```

Never open `SessionLocal()` or long-lived clients inside handlers.

## Schemas

- Omit secrets, hashes, tokens, and internal auth fields from response models.
- Set `response_model` on data endpoints.
- Prefer Pydantic constraints over hand-rolled validation.

## Security

- CORS origins per environment; no wildcard + credentials.
- Validate JWT exp, iss, aud, alg.
- Rate-limit auth and heavy writes.
- Redact credentials and auth headers in logs.

## Tests

- Override the same callable `Depends` references.
- Clear `app.dependency_overrides` after each test.
- Async clients for async apps.

Depth: `techne:python` skill (FastAPI reference).
