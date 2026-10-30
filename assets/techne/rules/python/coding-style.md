---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Standards

- PEP 8 layout and naming; annotate every public function signature.

## Immutability

Favor frozen or value-style data for shared state:

```python
from dataclasses import dataclass
from typing import NamedTuple

@dataclass(frozen=True)
class Account:
    handle: str
    mailbox: str

class Coord(NamedTuple):
    x: float
    y: float
```

## Tooling

- **black** — format
- **isort** — import order
- **ruff** — lint

Depth: `techne:python` skill.
