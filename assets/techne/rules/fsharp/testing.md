---
paths:
  - "**/*.fs"
  - "**/*.fsx"
  - "**/*.fsproj"
---
# F# Testing

> Builds on the shared rules in `../common/testing.md`.

## Stack

xUnit + FsUnit; **Unquote** for expressive asserts; **FsCheck** for properties; NSubstitute or function stubs; Testcontainers when needed.

## Names

Backtick behavior descriptions; mirror `src/` under `tests/`.

## Web

`WebApplicationFactory` through full HTTP pipeline.

## Coverage

~80% on domain/validation/auth failures; CI `dotnet test` with coverage when enabled.

Depth: `techne:quality` skill.
