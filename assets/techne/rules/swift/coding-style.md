---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---
# Swift Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Format

SwiftFormat + SwiftLint (or Xcode 16+ `swift-format` if that is the repo standard).

## Values

Prefer `let`; structs by default; classes only for identity/reference semantics.

## Naming

Apple API Design Guidelines — clarity at call site; omit redundant type words; `static let` for constants.

## Errors

Typed throws (Swift 6+) where applicable; structured `LoadError`-style enums.

## Concurrency

Strict concurrency checking; `Sendable` values across actors; actors for shared mutation; structured concurrency over detached tasks.

Depth: `techne:swift` skill.
