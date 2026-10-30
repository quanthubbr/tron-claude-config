# Swift & SwiftUI — idiomatic modern Swift

Baseline: **Swift 6.3** toolchain unless the project pins older. Concurrency rules below assume **Swift 6.2+** (Approachable Concurrency, main-actor-by-default for apps). Rows marked **future** need 6.4+ — verify before shipping.

**Default ladder** — descend only with a stated reason:

| Need | First choice | Escalate when |
| --- | --- | --- |
| Data | `struct` / `enum` | identity, sharing, inheritance |
| Abstraction | concrete types | repeated logic across types |
| Polymorphism | `some P` | heterogeneous storage → `any P` |
| Execution | sync on main actor | hang in Instruments → `async` → `@concurrent` → `actor` |
| Hot memory | `Array`, `String` | profiled cost → `InlineArray`, `Span` |
| Safety | safe APIs | measured C interop → `Unsafe*` |

---

## Value types and ownership

- **`struct` / `enum` default**; `class` for identity, shared mutation, inheritance, or resource lifetime.
- **`let` until mutation is required.**
- Struct holding a **mutable class** breaks value semantics — immutable wrapper, COW, or hide mutation.
- **COW pattern**: final class storage + `isKnownUniquelyReferenced` before in-place mutation (arrays/strings pattern).
- **Enums** replace boolean + optional piles — illegal states unrepresentable; transitions atomic.
- **`~Copyable`** for unique resources; finish with `consuming` methods; explicit `borrowing` / `consuming` / `inout`.

```swift
struct SurfaceFinish {
  var gloss: Double
  private var backing: Bitmap

  mutating func tint(_ hue: Hue) {
    if !isKnownUniquelyReferenced(&backing) {
      backing = Bitmap(cloning: backing)
    }
    backing.apply(hue)
  }
}
```

---

## Errors and optionals

- Recoverable → `throws`; programmer fault → `precondition` / `fatalError`.
- Rich errors: `enum` cases with associated values.
- `guard` for failure exits; `if let` for happy-path unwrap.
- **`throws(MyError)`** for internal/generic forwarding; public API often stays untyped `throws`.
- Force-unwrap only with documented invariants; prefer `#require` in tests.

---

## Concurrency (Swift 6.2 model)

**Progression — do not skip:**

1. Single-threaded **MainActor** app — no extra concurrency.
2. **`async`/`await`** for latency (network, disk) — SDK may thread for you.
3. **`@concurrent`** after Instruments shows CPU blocking the main actor.
4. **`actor`** when isolated mutable state must leave the main actor without constant hopping.

**Build settings:** Enable **Approachable Concurrency**. App/UI targets: **Default Actor Isolation = MainActor** (`swiftSettings: [.defaultIsolation(MainActor.self)]` in packages). **Libraries** stay `nonisolated` by default — clients choose isolation.

**Critical:** `async` **does not** change executor — it runs on the caller's actor until suspended.

- **`@concurrent`** → concurrent pool (your heavy CPU).
- **`nonisolated`** → caller's context (library default).
- Unmarked methods → caller's actor.

```swift
nonisolated struct ImagePipeline {
  @concurrent
  func render(_ raw: Data) async -> UIImage {
    async let edges = detectEdges(raw)
    async let palette = extractPalette(raw)
    return await ComposedImage(edges: edges, palette: palette)
  }
}
```

- Profile before parallelizing; avoid tasks for trivial work.
- **One task per ordered workflow**; parallelize independent legs with `async let` / groups.
- After every **`await`**, re-validate assumptions — state may change across suspension.

### Actor reentrancy

- **Mutate state in synchronous actor methods** — those are your transactions.
- Keep `async` actor methods thin; classic bug: check cache → `await` fetch → write cache without recheck.
- Actors are **not FIFO** — use `Task` or `AsyncStream` when strict ordering matters.

---

## Sendable and races

- Value types: Sendable when stored properties are.
- **Public** types: explicit `Sendable` promise.
- `@MainActor` classes and actors: implicitly Sendable via isolation.
- **Shared model classes**: often intentionally **non-Sendable** — don't mark Sendable and lock manually.

**Fix data-race errors in order:**

1. Stop sharing — local copies per task.
2. Sendable value type.
3. Actor isolation.
4. Then `Mutex` / atomics / `@unchecked Sendable` (real internal sync only).

Globals: prefer `let` → `@MainActor` → `Mutex` → `nonisolated(unsafe)` last.

Callbacks: `@MainActor` on owned delegates; `MainActor.assumeIsolated` only when sure; `@preconcurrency import` as migration bridge.

---

## Structured concurrency

Prefer scoped work:

| Pattern | Use |
| --- | --- |
| `async let` | Fixed small fan-out |
| `withTaskGroup` | Dynamic count, bounded |
| `withDiscardingTaskGroup` | Children return `Void` |
| `Task { }` | Lifetime tied to UI event / delegate |
| `Task.detached` | Almost never |

Cancellation is cooperative — check before expensive steps; `withTaskCancellationHandler` for suspended work.

Bound parallelism — don't spawn unbounded children on huge collections.

Continuations: **`resume exactly once`** per path.

`AsyncStream` bridges delegate APIs — yield in handler, clean in `onTermination`.

---

## SwiftUI

- `View` and `@State` live on MainActor — extra `@MainActor` usually redundant with main-actor-by-default.
- APIs demanding `@Sendable` closures (`visualEffect`, layout, geometry) — **copy values in**, not `self`.

```swift
.visualEffect { [isHighlighted] effect, proxy in
  effect.scaleEffect(isHighlighted ? 1.02 : 1)
}
```

- Gesture/scroll callbacks: **synchronous** state + `withAnimation` on the same frame; `Task` only for follow-up I/O.
- Put state on the **UI/async boundary** — view triggers task; model mutates synchronously on completion.

---

## Protocols and generics

Flow: **concrete types → shared protocol → generic algorithms**.

- Empty protocol with identical defaults → constrained extension instead.
- **Requirement** = customization point (dynamic); **extension-only method** = static default (shadowing pitfalls on `any P`).
- Prefer composition over class inheritance.
- **`some P` default**; **`any P`** for heterogeneous storage or type erasure.
- Associated-type APIs don't consume `any P` directly — pass into `some P` helper to re-specialize.

---

## API design

- Swift-only modules: no type prefixes; avoid stealing generic names from Apple frameworks.
- Drop `get` prefix on properties and async fetchers.
- Access control documents intent at module edges.
- Illegal states unrepresentable: private setters, enums, typed IDs.
- Property wrappers express policy; result builders for DSLs; macros for repetitive derivable code (see below).

---

## Performance

**Algorithm first**, then micro:

- Know complexity — `remove(at:)` in a loop is O(n²); `removeAll(where:)` is O(n).
- Chained `map`/`filter` allocate — fuse hot loops manually after profiling.

Profile tests via Instruments (Time Profiler, Allocations).

Levers:

- `final` classes → devirtualization.
- Large struct copies vs COW class storage.
- `[ConcreteModel]` vs `[any Model]`.
- **`InlineArray<N, T>`** fixed-size inline buffer (6.2+).
- **`.span` / `RawSpan`** instead of escaping unsafe buffers (6.2+).
- Batch MainActor hops — pass arrays into one `@MainActor` update.

`async` functions use task allocator slabs — don't mark sync work `async` without awaits.

---

## ARC

- Lifetime ends at last **use**, not closing brace — don't rely on `deinit` timing.
- `weak`/`unowned` break cycles only — prefer restructuring to a tree.
- Keep `deinit` local; use `defer` at call sites for paired teardown.

---

## Testing — Swift Testing

Default for new tests. XCTest only for UI automation, performance metrics, ObjC exception tests.

```swift
@Test(arguments: [0, 1, 42])
func clampNeverNegative(input: Int) {
  #expect(Clamp.nonNegative(input) >= 0)
}

@Test
func decodeFailsCleanly() throws {
  let payload = try #require(fixtureData(named: "valid"))
  #expect(throws: ParseIssue.self) { try Parser().run(payload) }
}
```

- Suites as `struct` — fresh instance per test.
- `.disabled("reason")` over commenting out; `withKnownIssue` for external breakage.
- Parallel by default — fix hidden coupling instead of `.serialized` habit.

---

## Macros

Use when the compiler could derive boilerplate — type-check arguments pre-expansion; test with `assertMacroExpansion`; emit diagnostics when misapplied.

---

## Logging

`Logger` (os) with subsystem/category; redact PII by default; correlate with request IDs; prefer `error`/`fault` for postmortems.

---

## Unsafe and interop

Unsafe APIs = preconditions yours to uphold. Prefer **`Span`** over raw pointers; smallest unsafe region; Address Sanitizer in debug.

Adopt Swift incrementally across C/ObjC/C++ boundaries; `@c` export (6.3+) when exposing Swift to C.

---

## Modern syntax cheat sheet

| Legacy habit | Prefer | Since |
| --- | --- | --- |
| Nested ternary init | `if`/`switch` expression | 5.9 |
| N overloads | parameter packs | 5.9 |
| `ObservableObject` everywhere | `@Observable` | 5.9 |
| Polling changes | `Observations { }` | 6.2 |
| Stringly notifications | typed messages | 6.2 |
| `withUnsafeBufferPointer` | `.span` | 6.2 |
| `InlineArray` hot fixed buffers | 6.2 |
| Module/type clash `Mod.Type` | `Mod::Type` | 6.3 |
| Hand date/number regex | Foundation parsers in regex | 5.7+ |

**Future (6.4+):** cancellation shields, `mapKeyedValues`, `@available(anyAppleOS ...)`, `@diagnose`, `~Sendable` — confirm toolchain.

---

## Migration to Swift 6

1. New compiler, Swift 5 mode.
2. Per target: complete concurrency checking — start UI layer.
3. Fix warnings (globals → `let`, MainActor placement, public Sendable).
4. Enable Swift 6 language mode.
5. Refactor separately — never mix big refactor + concurrency flip.

Enable Approachable Concurrency and main-actor-by-default **before** mass-fixing errors.

---

## Quick lookup

| Need | Reach for | Avoid |
| --- | --- | --- |
| Data | `struct` / `enum` | gratuitous `class` |
| Offload CPU | `@concurrent` | `Task.detached`, GCD spam |
| Library API | `nonisolated` | forcing MainActor |
| Parallel batch | bounded task group | unbounded per-item tasks |
| UI event work | sync callback + `Task` for I/O | `async` button handlers |
| Data race | stop sharing | `@unchecked Sendable` |
| Storage polymorphism | `some P` | `any P` everywhere |
| Hot contiguous access | `.span` | escaping pointers |
| New unit test | `@Test` / `#expect` | copy-paste XCTest loops |
| Optimize | Instruments on a test | guessing |
