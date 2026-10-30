---
paths:
  - "**/*.test.tsx"
  - "**/*.test.jsx"
  - "**/*.spec.tsx"
  - "**/*.spec.jsx"
  - "**/__tests__/**/*.ts"
  - "**/__tests__/**/*.tsx"
---
> Extends [typescript/testing.md](../typescript/testing.md).

# React testing

## Stack

React Testing Library + Vitest (Vite) or Jest (Next legacy). One component runner per repo.

## Queries

Prefer `getByRole` with accessible name, then label, placeholder, text. `getByTestId` last.resort. Use `findBy*` / `waitFor` for async — never fixed `setTimeout`.

## Interactions

`@testing-library/user-event` with `await`; setup once per test.

## Network

MSW at the fetch boundary; override handlers per test for error paths.

## Hooks

`renderHook` + `act` for custom hooks; test public API only.

## Anti-patterns

No snapshotting large trees; no asserting render counts; do not mock React itself.

## Coverage (typical)

Utilities ≥90%; hooks ≥85%; presentational components ≥80% behavior; containers cover happy + error paths.

See **techne:react** and **techne:quality** for E2E and a11y automation (`ui-design` audit for manual a11y pass).
