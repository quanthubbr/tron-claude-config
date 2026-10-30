# Python core

## Style and types

- Public APIs get annotations; use built-in generics (`list[str]`) on 3.9+.
- `Protocol` for duck-typed dependencies; `TypeVar` for small generic helpers.
- Dataclasses for bundles of fields; validate in `__post_init__` when rules are simple.

```python
from dataclasses import dataclass
from typing import Protocol

class Notifier(Protocol):
    def send(self, message: str) -> None: ...

@dataclass(frozen=True, slots=True)
class Address:
    line1: str
    city: str
    postal: str
```

## Errors

- Narrow `except` clauses; translate IO/parse failures into domain types.
- Preserve cause: `raise ConfigLoadError(path) from err`.

```python
class AppError(Exception): ...
class MissingResource(AppError): ...

def load_json(path: str) -> dict:
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise MissingResource(path) from exc
    except json.JSONDecodeError as exc:
        raise AppError(f"invalid json: {path}") from exc
```

## Resources and iteration

- Prefer EAFP for dict/key access when a missing key is ordinary.
- Generators for large files/streams; `"".join(...)` instead of `+=` in loops.
- `__slots__` on high-volume small objects when profiling shows memory pressure.

## Concurrency

| Workload | Tool |
|----------|------|
| Blocking I/O (HTTP, disk) | `ThreadPoolExecutor` or async + aiohttp |
| CPU-bound batch | `ProcessPoolExecutor` |
| Many concurrent I/O coroutines | `asyncio` + async libraries |

Do not call blocking DB drivers inside `async def` without `asyncio.to_thread` or an async driver.

## Layout and imports

```
project/
  src/pkg/
  tests/
  pyproject.toml
```

Order: stdlib → third-party → local. Export stable surface via `__all__` in package `__init__.py`.

## Tooling (typical CI)

```bash
ruff check . && ruff format --check .
mypy src
pytest -m "not slow" --cov=pkg --cov-report=term-missing
bandit -r src -q
pip-audit || true   # advisory; pin fixes in pyproject
```

`pyproject.toml` should declare dev extras (pytest, ruff, mypy) and tool sections (`[tool.ruff]`, `[tool.mypy]`, `[tool.pytest.ini_options]`).

## Pitfalls

| Avoid | Prefer |
|-------|--------|
| `except:` / silent pass | log + re-raise or domain error |
| `from mod import *` | explicit symbols |
| `== None` | `is None` |
| mutable default args | `None` + fresh list inside |
| clever one-liner comprehensions | named helper when filters stack |
