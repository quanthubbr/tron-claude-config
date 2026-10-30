---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---
# Swift Testing

> Builds on the shared rules in `../common/testing.md`.

## Framework

Swift Testing (`import Testing`) — `@Test`, `#expect`, `#require`.

## Isolation

Per-test setup in `init`/`deinit`; no shared mutable globals.

## Parameterized

`@Test(arguments: [...])` for matrix cases.

## Coverage

```bash
swift test --enable-code-coverage
```

Depth: `techne:swift` skill (DI and mocks with Swift Testing).
