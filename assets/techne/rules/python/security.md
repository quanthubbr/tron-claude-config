---
paths:
  - "**/*.py"
  - "**/*.pyi"
---
# Python Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

```python
import os
from dotenv import load_dotenv

load_dotenv()
token = os.environ["SERVICE_TOKEN"]  # KeyError if unset
```

## Static scan

```bash
bandit -r src/
```

Framework-specific hardening: `techne:python` skill. Broad review: `security-review` skill / `exo-security` agent.
