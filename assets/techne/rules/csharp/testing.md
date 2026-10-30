---
paths:
  - "**/*.cs"
  - "**/*.csx"
  - "**/*.csproj"
---
# C# Testing

> Builds on the shared rules in `../common/testing.md`.

## Stack

xUnit, FluentAssertions, Moq/NSubstitute, Testcontainers when needed.

## Layout

Mirror `src/` under `tests/`; behavior-named tests.

## Web

`WebApplicationFactory` integration tests through HTTP middleware — do not bypass auth/pipeline.

## Coverage

~80% on domain, validation, auth, failure paths; CI `dotnet test` with coverage when enabled.

Depth: `techne:quality` skill; `techne:dotnet` for stack patterns.
