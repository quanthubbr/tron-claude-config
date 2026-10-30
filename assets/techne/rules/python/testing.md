---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Testing

> Builds on the shared rules in `../common/testing.md`.

## Runner

**pytest** default.

```bash
pytest --cov=src --cov-report=term-missing
```

## Marks

```python
import pytest

@pytest.mark.unit
def test_subtotal():
    ...

@pytest.mark.integration
def test_pool_connect():
    ...
```

Depth: `techne:python` skill (testing reference).
