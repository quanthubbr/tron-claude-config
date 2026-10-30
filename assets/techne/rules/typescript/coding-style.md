---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
---
> Builds on the shared rules in `../common/coding-style.md`.

# TypeScript / JavaScript style

## Typing policy

- Exported functions, public class methods, and shared DTOs: explicit parameter + return types
- Locals: infer when obvious
- Repeated inline object shapes → named `type`/`interface`

`interface` for extend/implement shapes; `type` for unions, tuples, mapped types. Prefer string union literals over `enum` unless generating API contracts that require enums.

## Safety

Ban `any` in application code. External payloads: `unknown` + narrowing (`instanceof`, type guards, schema parse).

React props: dedicated `Props` type; skip `React.FC` unless children typing demands it.

## Data handling

Updates clone via spread/`Readonly` rather than mutating arguments.

`async`/`await` with `catch (err: unknown)` funneled through a small `getErrorMessage` helper.

## Validation

Zod (or equivalent) at IO edges; export inferred types via `z.infer`.

## Logging

No stray `console.log` in committed code — use the project logger; hooks may warn on debug prints in edited files.
