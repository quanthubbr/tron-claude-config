# FastAPI

## Layout

```
app/
  main.py          # create_app(), lifespan
  config.py        # pydantic-settings
  dependencies.py
  database.py
  routers/
  models/          # SQLAlchemy
  schemas/         # Pydantic v2
  services/
tests/conftest.py
```

## App factory and settings

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await engine.dispose()

def create_app() -> FastAPI:
    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
    return app
```

`Settings` via `pydantic_settings.BaseSettings`; load `.env` in dev only—inject secrets from environment in prod.

## Schemas (Pydantic v2)

- `model_config = ConfigDict(from_attributes=True)` on ORM response models.
- Cross-field rules: `@model_validator(mode="after")`.
- Separate `Create`, `Update` (`exclude_unset` on patch), and `Read` models.

## Dependencies

```python
from typing import Annotated

DbSession = Annotated[AsyncSession, Depends(get_session)]

async def current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: DbSession,
) -> User:
    ...
```

Type aliases (`DbSession`, `ActiveUser`) reduce router noise.

## Routers

- Always set `response_model` and explicit status codes.
- Map domain errors to `HTTPException` or registered handlers—401 vs 403 must differ.
- Pagination: `Query(ge=0)` / `le=100`; **stable `order_by` column** on every offset query.

## Services and transactions

```python
class InvoiceService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, payload: InvoiceCreate) -> Invoice:
        row = Invoice(**payload.model_dump())
        self.db.add(row)
        try:
            await self.db.commit()
        except IntegrityError as exc:
            await self.db.rollback()
            raise DuplicateInvoiceError from exc
        await self.db.refresh(row)
        return row
```

Unique constraints belong in the database; catch `IntegrityError` instead of check-then-insert races.

## Async rules

- Use `AsyncSession` + `await session.execute(select(...))`.
- Blocking libraries → thread pool or swap library.

## Testing (httpx)

```python
@pytest_asyncio.fixture
async def client(db_session):
    app = create_app()
    app.dependency_overrides[get_session] = lambda: _override(db_session)
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as ac:
        yield ac
```

Override DB and auth dependencies; use in-memory SQLite (`aiosqlite`) or test container per project policy.

## Lifespan vs migrations

- Dev-only: metadata `create_all` in lifespan is acceptable for demos.
- Production: Alembic (or equivalent) owns schema; lifespan only opens/closes pools.

## Anti-patterns

| Bad | Good |
|-----|------|
| ORM logic in route | service method |
| sync `Session` in async route | AsyncSession |
| returning ORM model directly | response schema |
| unbounded list endpoints | limit + sort + filters |
