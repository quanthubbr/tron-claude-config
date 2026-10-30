# Code review

Review after substantive edits and before merge on shared branches, auth/data changes, or API shifts.

Pre-review: CI green, conflicts resolved, up to date with target.

Checklist: readable code; functions ~<50 lines; files ~<800 lines; nesting ≤4; explicit errors; no secrets/debug logs; tests for new behavior (often ≥80% coverage).

Escalate to **exo-security** / `security-review` for auth, input, SQL, FS, external HTTP, crypto, payments.

Severity: CRITICAL blocks; HIGH should fix; MEDIUM/LOW as time allows.

Flow: diff → security → quality → tests → **exo-qa** / `code-review` skill.

See [testing.md](./testing.md), [security.md](./security.md).
