# Go patterns

## Layout and packages

Typical service repo: `cmd/<app>/main.go`, `internal/` for private app code, `pkg/` only for libraries meant for external importers, `api/` for OpenAPI/proto, `testdata/` for fixtures. Package names: short, lowercase, no `util` dumping grounds.

Inject dependencies through structs and constructors—do not open DB pools in `init()` from environment variables.

## Errors

Sentinel vars for stable domain cases (`ErrNotFound`). Typed errors when callers need fields. Wrap at each layer with a short verb phrase:

```go
if err != nil {
    return nil, fmt.Errorf("load profile %q: %w", id, err)
}
```

Prefer early return over nested `if err != nil`.

## Interfaces

Keep interfaces tiny (often one method). Consumer packages declare what they need:

```go
type Ledger interface {
    Post(ctx context.Context, entry Entry) error
}
```

Optional behavior: type assert to a secondary interface (e.g. `Flusher`) instead of widening the base API.

## Concurrency

**Worker pool:** fixed goroutines reading `jobs` until closed; `WaitGroup` for drain.

**Fan-out:** `errgroup.WithContext` cancels siblings on first error; capture loop indices before `g.Go`.

**HTTP client:** `NewRequestWithContext`, always `defer resp.Body.Close()`, set timeouts on the client or context.

**Shutdown:** trap `SIGINT`/`SIGTERM`, `Shutdown` with ~30s context, then exit.

Avoid sending on unbuffered channels without a receiver; prefer buffer size 1 plus cancel branch when exposing async helpers.

## Struct patterns

**Functional options:** `type Option func(*Server)` with defaults inside `New`, variadic `opts ...Option`.

**Embedding:** compose behavior (logging, metrics) without deep inheritance trees.

## Performance habits

| Situation | Approach |
|-----------|----------|
| Known output count | Pre-sized slice |
| Repeated temp buffers | `sync.Pool` with reset in defer |
| String assembly in loop | `strings.Builder` |
| Map/set membership hot path | `map[T]struct{}` |

Profile before `sync.Pool`; misuse adds complexity.

## Tooling

```bash
go build ./...
go test -race -cover ./...
go vet ./...
staticcheck ./...
golangci-lint run
go mod tidy && go mod verify
gofmt -w . && goimports -w .
```

Enable errcheck, staticcheck, govet (shadow), ineffassign in CI linter config.

## Anti-patterns

| Avoid | Prefer |
|-------|--------|
| `panic` for expected errors | Return `error` |
| Context stored on structs | Context as first param |
| Naked returns in long funcs | Named returns only when signature is tiny |
| Mixed value/pointer receivers | One style per type |
| Returning `interface{}` from domain APIs | Concrete structs |
| Global `var db *sql.DB` | Struct field + constructor |

Cross-stack HTTP and middleware conventions → **techne:services**.
