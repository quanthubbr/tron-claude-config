---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Structural typing

```python
from typing import Protocol

class ItemStore(Protocol):
    def load(self, key: str) -> dict | None: ...
    def persist(self, row: dict) -> dict: ...
```

## Request DTOs

```python
from dataclasses import dataclass

@dataclass
class RegisterPayload:
    display_name: str
    mailbox: str
    years: int | None = None
```

## Resources

- `with` for acquire/release
- Generators for lazy, memory-bounded iteration

Depth: `techne:python` skill.
