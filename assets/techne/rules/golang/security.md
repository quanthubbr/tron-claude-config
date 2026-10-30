---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

```go
key := os.Getenv("BILLING_KEY")
if key == "" {
    log.Fatal("BILLING_KEY not configured")
}
```

## Scan

```bash
gosec ./...
```

## Timeouts

Always bound I/O with context:

```go
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()
```
