---
description: Measure test coverage, rank the weakest files, and add the missing tests until the target (default 80%) is met.
argument-hint: "[target %] [path]"
---

# /test-coverage

Raise coverage where it buys confidence — behavior and failure paths, not line-count padding. Default target 80% unless the project or argument sets another.

## 1. Measure

| Marker | Run |
|---|---|
| Vitest config | `npx vitest run --coverage` |
| Jest config / `jest` in `package.json` | `npx jest --coverage --coverageReporters=json-summary` |
| pytest | `pytest --cov=<pkg> --cov-report=json` |
| `go.mod` | `go test -coverprofile=coverage.out ./... && go tool cover -func=coverage.out` |
| `Cargo.toml` | `cargo llvm-cov --json` |
| Maven + JaCoCo | `mvn test jacoco:report` |

## 2. Rank gaps

List files under target, worst first. For each, note the untested functions, the unexercised branches (else arms, switch cases, catch blocks, early returns), and dead code that only inflates the denominator — flag that for removal instead of testing it.

## 3. Write tests, in this order

1. Main success path with realistic input.
2. Failure handling: invalid input, missing records, dependency errors and timeouts.
3. Boundaries: empty collections, null/undefined/None, 0, -1, max values, unicode.
4. Remaining branches.

Conventions: follow the project's existing test layout, naming, assertion and mocking style; mock only true externals (network, DB, clock, filesystem); keep tests independent; name each test after the behavior it proves (`rejects_duplicate_email_with_409`).

Priority targets: high-branching functions, error handlers, widely shared utilities, request→response paths of API handlers.

## 4. Verify

Full suite green, coverage re-measured. Still short → repeat step 3 on what remains.

## 5. Report

A before/after table per touched file plus the overall figure, and any code flagged as dead.
