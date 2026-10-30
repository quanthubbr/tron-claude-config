---
name: cpp
description: Modern C++17/20/23 style—RAII, value semantics, Core Guidelines–aligned types, concurrency, and templates. Use when writing, reviewing, or refactoring C++ classes, headers, or performance-sensitive native code.
---

Native code should be type-safe by default: resources tied to object lifetime, immutability unless mutation is required, and errors expressed as exceptions or explicit types—not ad hoc globals. Use **atlas** for codebase structure, **biblos** for standard library and compiler flags, **code-review** / **exo-qa** on changes, and **exo-security** when handling untrusted input or process boundaries.

## Non-negotiable rules

1. **RAII owns resources** — no naked `new`/`delete`; express ownership with `unique_ptr` (default) or `shared_ptr` when lifetime is genuinely shared; raw pointers are non-owning observers only.
2. **Initialize every object; prefer `{}` initialization** — default to `const` / `constexpr`; avoid narrowing conversions and magic literals—name constants instead.
3. **Rule of Zero unless you manage a raw resource** — then implement or delete all five special members explicitly.
4. **`enum class` for typed enumerations** — scoped enumerators without ALL_CAPS; replace capability macros with `constexpr`.
5. **Return values and small structs** — avoid out-parameters; never return pointers or references to locals; cheap scalars by value, heavy inputs by `const&`.
6. **`explicit` single-argument constructors** — polymorphic bases need public virtual or protected non-virtual destructors; use `override`/`final` consistently.
7. **Exceptions: typed hierarchy, throw by value, catch by `const&`** — destructors and swaps must not fail; do not swallow unknown errors at every layer.
8. **Concurrency: named RAII locks** — `scoped_lock` / `lock_guard`; wait with predicates; never invoke callbacks while holding locks; skip lock-free code unless expert-reviewed.
9. **Constrain templates with concepts (C++20)** — prefer standard concepts and `using` aliases; overload functions instead of specializing function templates.
10. **Standard library first** — `vector` / `array` over C arrays; `string` owns, `string_view` observes; use `'\n'` instead of `endl` to avoid forced flushes.
11. **Headers self-contained** — include guards or `#pragma once`; no `using namespace` at global scope in headers; one consistent `snake_case` style, no Hungarian notation.
12. **Measure before optimizing** — profile hot paths; prefer compile-time computation (`constexpr`) and contiguous storage for cache-friendly loops.

## References

| File | Load when |
|------|-----------|
| [reference/coding-standards.md](reference/coding-standards.md) | Philosophy, functions, classes, resources, errors, concurrency, templates, checklist |
