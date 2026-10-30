# C++ coding standards

Aligned with the ISO C++ Core Guidelines mindset: static type safety, value semantics, and explicit ownership. Adapt rules when embedded constraints forbid exceptions or dynamic allocation—document deviations in ADRs (**techne:research**).

## Cross-cutting themes

| Theme | Practice |
|-------|----------|
| Resources | Constructors acquire, destructors release |
| Immutability | `const` data, `const` methods, `const&` parameters |
| Type safety | Strong typedefs, `enum class`, concepts |
| Clarity | Named operations, low arity, pure functions where possible |
| Complexity | Short functions, minimal nesting |

## Functions

- One logical operation per function; mark `constexpr` when compile-time eligible; `noexcept` when failure is impossible.
- Inputs: scalars/enums by value; large objects by `const&`; sinks (`std::string`) by value for move.
- Outputs: return struct/tuple; avoid `T&&` returns and C-style variadics.
- Lambdas passed to threads: capture by value unless lifetime is proven.

```cpp
struct TokenPair {
    std::string value;
    std::size_t offset;
};

TokenPair lex(std::string_view input);
```

## Classes

**Rule of Zero example** — rely on generated special members:

```cpp
struct Employee {
    std::string name;
    int id{};
};
```

**Rule of Five** when wrapping raw handles—delete or define copy/move/destructor together.

Hierarchy tips: pure virtual interfaces; no virtual calls in constructors/destructors; suppress public copying on polymorphic types when slicing is a risk.

## Resource management

```cpp
auto widget = std::make_unique<Widget>(cfg);
auto cache = std::make_shared<Cache>(1024);

void draw(const Widget* w) { if (w) w->render(); }
```

Wrap C handles in RAII classes with deleted copying and defined move operations; use `std::exchange` in move assign.

Avoid multiple heap allocations in one full-expression without strong exception guarantee.

## Expressions

- Always initialize; prefer braced init lists.
- `nullptr` for pointer null; avoid C casts—use `static_cast` / `reinterpret_cast` deliberately.
- Complex `const` setup: immediately-invoked lambda assigning to `const auto`.

## Error handling

Design strategy early: exceptions for unrecoverable domain failures in app code, error codes at FFI boundaries if required.

```cpp
class app_error : public std::runtime_error {
    using std::runtime_error::runtime_error;
};

void connect(std::string_view host) {
    throw app_error("refused connection to " + std::string(host));
}

try {
    connect("example.com");
} catch (const app_error& ex) {
    log(ex.what());
}
```

Do not throw built-in types; do not catch by value.

## Constants and immutability

Member data that never changes after construction should be `const`. Member functions that do not mutate should be `const`. Pass observers as `const&` or `string_view`.

## Concurrency

```cpp
void enqueue(int v) {
    std::lock_guard lock{mutex_};
    queue_.push(v);
    cv_.notify_one();
}

int dequeue() {
    std::unique_lock lock{mutex_};
    cv_.wait(lock, [this] { return !queue_.empty(); });
    int v = queue_.front();
    queue_.pop();
    return v;
}
```

Use `std::scoped_lock` when taking multiple mutexes. Do not use `volatile` for synchronization.

## Templates and concepts

```cpp
template<std::integral T>
T gcd(T a, T b) {
    while (b != 0) { a = std::exchange(b, a % b); }
    return a;
}

template<std::ranges::random_access_range R>
void sort_in_place(R& range) {
    std::ranges::sort(range);
}
```

Keep unconstrained templates out of widely included headers; prefer `using` over `typedef`.

## Standard library usage

| Need | Prefer |
|------|--------|
| Fixed size | `std::array` |
| Dynamic size | `std::vector` |
| Text ownership | `std::string` |
| Text view | `std::string_view` |
| Output | `'\n'` not `endl` |

## Headers and naming

Headers include everything they need; guards like `PROJECT_MODULE_WIDGET_H`. Implementation in `.cpp`. Namespaces mirror project modules; trailing underscore on data members if that is the project convention—stay consistent.

## Performance

Do not micro-optimize without measurements. Hoist work to compile time when inputs are constant. Prefer contiguous containers over pointer graphs for hot loops.

## Pre-ship checklist

- [ ] Smart pointers / RAII—no manual delete
- [ ] All variables initialized; `const` by default
- [ ] `enum class`, `nullptr`, no narrowing
- [ ] Explicit converting constructors reviewed
- [ ] Rule of Zero/Five satisfied
- [ ] Virtual destructor policy correct on bases
- [ ] Concepts on public templates
- [ ] Headers standalone; no global `using namespace`
- [ ] Locks are named RAII guards
- [ ] Typed exceptions, catch by reference
- [ ] No magic numbers

Legacy C-only codebases may adopt subsets gradually—track gaps in review notes.
