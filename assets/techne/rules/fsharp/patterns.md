---
paths:
  - "**/*.fs"
  - "**/*.fsx"
---
# F# Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Result railway

```fsharp
type OrderProblem =
    | BadCustomer of string
    | NoLines

let validateDraft (req: DraftOrder) : Result<ValidOrder, OrderProblem> =
    if String.IsNullOrWhiteSpace req.CustomerId then Error(BadCustomer "CustomerId required")
    elif List.isEmpty req.Lines then Error NoLines
    else Ok { CustomerId = req.CustomerId; Lines = req.Lines }
```

## Option

`Option.map` / `bind` / `defaultValue` instead of null checks.

## Unions

Exhaustive `match` on business states (payment, fulfillment, etc.).

## Computation expressions

`result { }` / custom CEs for sequential validation.

## Modules

`[<RequireQualifiedAccess>]` on domain modules; functions over classes.

## DI

Record-of-functions or explicit parameters; partial application for pipelines.

Depth: `techne:dotnet` skill.
