---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---
# Swift Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS`.

## PostToolUse

- **SwiftFormat**
- **SwiftLint**
- **swift build** on package edits (standard/strict)

## Warnings

Flag `print()` — prefer `os.Logger` or structured logging.
