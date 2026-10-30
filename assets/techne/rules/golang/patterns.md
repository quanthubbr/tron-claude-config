---
paths:
  - "**/*.go"
  - "**/go.mod"
  - "**/go.sum"
---
# Go Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Functional options

```go
type Tune func(*Server)

func WithListenPort(p int) Tune {
    return func(s *Server) { s.port = p }
}

func NewServer(tunes ...Tune) *Server {
    s := &Server{port: 8080}
    for _, t := range tunes {
        t(s)
    }
    return s
}
```

## Interfaces

Declare small interfaces at the call site, not on the implementer.

## Wiring

Constructor injection:

```go
func NewBillingSvc(store LedgerStore, log Logger) *BillingSvc {
    return &BillingSvc{store: store, log: log}
}
```

Depth: `techne:go` skill.
