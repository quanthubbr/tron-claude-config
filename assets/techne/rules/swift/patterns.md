---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---
# Swift Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Protocols

Small `Sendable` protocols; default implementations in extensions.

## State enums

```swift
enum FetchPhase<T: Sendable>: Sendable {
    case idle, working, done(T), broken(Error)
}
```

## Actors

Shared caches/registries as actors instead of manual locks.

## DI

Protocol parameters with production defaults; inject test doubles in tests.

Depth: `techne:swift` skill (concurrency, SwiftUI, testing).
