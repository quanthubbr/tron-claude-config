---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` (`minimal` | `standard` | `strict`); disable ids with `EXONOUS_DISABLED_HOOKS`.

## PostToolUse

- **gofmt** / **goimports** on touched `.go`
- **go vet** after edits
- **staticcheck** on changed packages when profile is `standard` or `strict`
