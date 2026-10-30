# Go testing

## TDD loop

1. Sketch signature or interface.
2. Write failing test (table row or subtest).
3. Minimal implementation until green.
4. Refactor with `-race` still passing.

Broader red-green discipline → **techne:quality**.

## Table-driven template

```go
func TestNormalizeEmail(t *testing.T) {
    cases := []struct {
        name string
        in   string
        want string
        err  bool
    }{
        {"trim lower", "  A@B.com ", "a@b.com", false},
        {"empty", "", "", true},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            got, err := NormalizeEmail(tc.in)
            if tc.err {
                if err == nil {
                    t.Fatal("expected error")
                }
                return
            }
            if err != nil {
                t.Fatalf("unexpected: %v", err)
            }
            if got != tc.want {
                t.Fatalf("got %q want %q", got, tc.want)
            }
        })
    }
}
```

Use `reflect.DeepEqual` only when no clearer field asserts exist.

## Organization

- Group related flows under `t.Run` blocks sharing setup.
- `t.Parallel()` only when cases do not share mutable fixtures.
- Helpers: `t.Helper()`, fail with `t.Fatalf`, register `t.Cleanup` for closes.

## Golden files

Store expected bytes under `testdata/*.golden`. Gate updates behind a flag:

```go
var updateGoldens = flag.Bool("update", false, "rewrite golden files")

if *updateGoldens {
    os.WriteFile(goldenPath, got, 0o644)
}
```

Run `go test -update` locally; never commit refreshed goldens without reviewing diff.

## Mocks

Define small interfaces in the consumer package; tests supply stub structs with function fields:

```go
type stubStore struct {
    load func(id string) (*User, error)
}
func (s stubStore) Load(id string) (*User, error) { return s.load(id) }
```

Prefer real sqlite/postgres test containers for integration paths when feasible.

## HTTP handlers

```go
req := httptest.NewRequest(http.MethodGet, "/health", nil)
rec := httptest.NewRecorder()
Handler(rec, req)
if rec.Code != http.StatusOK {
    t.Fatalf("status %d", rec.Code)
}
```

Table-drive method, path, body, expected status and JSON snippets.

## Benchmarks and fuzz

```go
func BenchmarkEncode(b *testing.B) {
    payload := mkPayload(1024)
    b.ReportAllocs()
    for i := 0; i < b.N; i++ {
        _, _ = Encode(payload)
    }
}
```

Run `go test -bench=. -benchmem`. Fuzz decoders with seed corpus plus `go test -fuzz=FuzzDecode -fuzztime=30s`; assert invariants (roundtrip, no panic on reject).

## Coverage

```bash
go test -race -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
go tool cover -html=coverage.out
```

| Layer | Target |
|-------|--------|
| Money / auth / invariants | 100% |
| Exported API | ≥90% |
| Everything else | ≥80% |

Exclude generated mocks from coverage via build tags when needed.

## Commands cheat sheet

```bash
go test ./...
go test -run TestUser/Create ./...
go test -short ./...
go test -count=10 ./...   # flake hunt
go test -timeout 30s ./...
```

## Practices

| Do | Skip |
|----|------|
| Assert behavior through public API | Importing `_test` packages to poke privates |
| `t.Cleanup` for files and servers | `time.Sleep` for readiness—poll or channels |
| Descriptive subtest names | Ignoring flaky tests |
| Error-path table rows | Mocking every leaf when one integration test suffices |

Security-sensitive parsing → add fuzz + **security-review** / **exo-security** pass.
