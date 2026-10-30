---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Format

**gofmt** and **goimports** — non-negotiable.

## APIs

- Parameters: interfaces; returns: concrete structs.
- Keep interfaces tiny (often 1–3 methods).

## Errors

Wrap with context:

```go
if err != nil {
    return fmt.Errorf("persist profile: %w", err)
}
```

Depth: `techne:go` skill.
