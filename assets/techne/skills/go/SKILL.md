---
name: go
description: Idiomatic Go structure, errors, concurrency, and testing—table-driven tests, race detector, fuzzing, benchmarks. Use when writing or reviewing Go services, CLIs, packages, or `go test` / module layout.
---

Go favors boring, obvious code: explicit errors, small interfaces at call sites, and concurrency tied to `context`. Pair with **atlas** for repo layout, **biblos** for stdlib and third-party APIs, **techne:services** for HTTP/API design, **techne:quality** for broader TDD gates, and **code-review** / **exo-qa** before merge.

## Non-negotiable rules

1. **Readability beats cleverness** — straight-line control flow; return early on errors so the happy path stays shallow.
2. **Every error gets a decision** — wrap with `%w` and operation context; classify with `errors.Is` / `errors.As`; never assign to `_` unless documented (e.g. best-effort close).
3. **Take interfaces, return structs** — define narrow interfaces where they are consumed, not in provider packages.
4. **`context.Context` first** on RPC, DB, and HTTP paths — derive timeouts; propagate cancel; shut down with `Shutdown` and a bounded wait, not abrupt `Close` on servers.
5. **Goroutines must finish** — tie work to context or wait groups; use buffered sends or `select` on `ctx.Done()` so cancelled callers cannot leak workers.
6. **Zero values should work** — lazy-init maps/slices inside methods; avoid mutable package-level singletons; inject `*sql.DB`, loggers, and clients via constructors.
7. **Preallocate when size is known** — `make([]T, 0, n)`; build strings with `strings.Builder` or `strings.Join` in hot loops.
8. **Table-driven tests** — one `TestX` with `[]struct{ name, … }` and `t.Run`; copy loop variables before `t.Parallel()` subtests.
9. **Helpers call `t.Helper()`** — register cleanup with `t.Cleanup`; use `t.TempDir`, `httptest`, and interface fakes instead of testing unexported symbols.
10. **CI runs `go test -race ./...`** — cover critical paths toward 100%, public packages ≥90%, rest ≥80%; fuzz parsers and decoders where inputs are untrusted.
11. **Gate merges with vet, staticcheck, golangci-lint** — `gofmt` / `goimports` on every change; `go mod tidy` before commit.
12. **Functional options for optional config** — keep constructors stable; one receiver style (pointer or value) per type.

## References

| File | Load when |
|------|-----------|
| [reference/patterns.md](reference/patterns.md) | Packages, errors, interfaces, concurrency, memory, tooling, anti-patterns |
| [reference/testing.md](reference/testing.md) | TDD loop, tables, mocks, golden files, HTTP tests, bench/fuzz, coverage |
