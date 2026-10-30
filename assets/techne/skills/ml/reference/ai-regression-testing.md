# AI regression testing

When the same agent writes and reviews code, shared assumptions hide bugs. Automated tests—especially contract tests on API shapes and dual code paths—catch failures reviews miss.

## When to use

- Agent touched routes, inference handlers, or feature-flagged paths
- A bug was fixed and must not return
- Sandbox/mock mode exists for fast tests without production DB

## Core failure mode

```
agent implements fix → agent reviews fix → “looks fine” → bug remains
```

Highest-frequency pattern: **sandbox vs production branches return different shapes** (field added on one path only).

## Strategy: test where bugs happened

Do not chase coverage percentages. Add tests adjacent to incident sites; similar mistake classes cluster in auth, multi-path handlers, and optimistic UI.

| Priority | Pattern | Test focus |
|----------|---------|------------|
| High | Dual-path mismatch | Same JSON keys in mock/sandbox mode |
| High | DB SELECT omitting new column | Response includes required fields |
| Medium | Error leaves stale UI state | State cleared on failure |
| Medium | Optimistic UI without rollback | Prior state restored on API error |

## Sandbox-first API tests

Force mock/sandbox env in test setup so suites stay fast and DB-free.

```typescript
// vitest setup excerpt
process.env.SANDBOX_MODE = "true";
```

Build requests against route handlers directly; assert **response contract**, not SQL internals.

```typescript
const REQUIRED = ["id", "email", "full_name", "notification_settings"];

it("GET /api/user/profile exposes contract", async () => {
  const res = await GET(createRequest("/api/user/profile"));
  const { status, json } = await parse(res);
  expect(status).toBe(200);
  for (const key of REQUIRED) {
    expect(json.data).toHaveProperty(key);
  }
});

it("regression: notification_settings present (BUG-R1)", async () => {
  const { json } = await parse(await GET(createRequest("/api/user/profile")));
  expect("notification_settings" in json.data).toBe(true);
});
```

Name tests after the incident id when useful (`BUG-R1`).

## Bug-check workflow

1. **Automated first (mandatory)** — unit/API tests, then typecheck/build. Failures outrank subjective review.
2. **Review second** — dual-path parity, SELECT completeness, error rollback, race-prone optimistic updates. Use **exo-qa** / **code-review**; do not skip step 1.
3. **For each fix** — add or extend a regression test before closing.

## Dual-path parity example

```typescript
// bad: new field only on live branch
if (sandbox()) return { data: { id, email } };
return { data: { id, email, notification_settings } };

// good: parallel shapes (null placeholders ok in sandbox)
const settings = sandbox() ? null : row.notification_settings;
return { data: { id, email, notification_settings: settings } };
```

## ML-specific regressions

- Train/serve feature parity: golden-vector test through both paths
- Promotion gate script: missing metric file fails CI
- LLM routing: log snapshot tests for tier selection on fixed inputs (no live API in CI when mocked)

Pair with **techne:ml** eval harness for agent/LLM behavior; pair with **techne:quality** for broader TDD.

## DO / DON'T

**DO**

- Write regression test when bug is reproduced (ideally before fix)
- Assert outward API/schema contracts
- Keep sandbox tests sub-second total when possible

**DON'T**

- Replace tests with agent self-review
- Skip mock path because “it's fake data”
- Add broad integration suites before first incident in that area
