# Python testing (pytest)

TDD flow: failing test → minimal pass → refactor. Deeper workflow markers: **techne:quality**.

## Coverage

- Line coverage ≥80% repo-wide; 100% on auth, payments, and permission matrices.
- `pytest --cov=pkg --cov-report=term-missing`; fail CI under threshold if configured.

## Structure

```
tests/
  conftest.py      # shared fixtures
  unit/
  integration/
```

One behavior per test; name describes outcome: `test_checkout_rejects_empty_cart`.

## Fixtures

```python
import pytest

@pytest.fixture
def clock(monkeypatch):
    fixed = datetime(2026, 1, 1, tzinfo=timezone.utc)
    monkeypatch.setattr("pkg.time.now", lambda: fixed)
    return fixed

@pytest.fixture(scope="module")
def engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()
```

- `yield` fixtures for teardown; `scope="session"` only for expensive shared setup.
- `autouse=True` sparingly (global config reset).

## Parametrize and markers

```python
@pytest.mark.parametrize("raw,expected", [("a@b.co", True), ("bad", False)])
def test_email(raw, expected):
    assert validate_email(raw) is expected

@pytest.mark.integration
def test_stripe_webhook(client): ...
```

Register markers in `pyproject.toml` / `pytest.ini` with `--strict-markers`.

## Mocking

```python
from unittest.mock import AsyncMock, patch

@patch("pkg.mail.send", new_callable=AsyncMock)
async def test_welcome_mail(mock_send):
    await on_user_created(user_id="u1")
    mock_send.assert_awaited_once()
```

- Patch where the name is **used**, not where defined.
- Prefer `autospec=True` for large collaborator APIs.

## Async

```python
import pytest

@pytest.mark.asyncio
async def test_fetch(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
```

Use `pytest-asyncio` (or native asyncio mode per project config).

## DB tests

- Roll back per test: nested transaction or fresh SQLite schema fixture.
- For Django/FastAPI HTTP tests, see framework reference files.

## Exceptions

```python
with pytest.raises(PaymentError, match="declined"):
    charge(card="bad")
```

## Commands

```bash
pytest -q
pytest tests/unit/test_fees.py::test_rounding
pytest -m "not integration" -x
pytest --lf          # last failed
pytest --maxfail=3
```

Do not assert implementation details (private attrs) unless testing a deliberate contract.
