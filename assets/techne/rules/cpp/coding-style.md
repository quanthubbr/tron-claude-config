---
paths:
  - "**/*.cpp"
  - "**/*.hpp"
  - "**/*.cc"
  - "**/*.hh"
  - "**/*.cxx"
  - "**/*.h"
  - "**/CMakeLists.txt"
---
# C++ Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Modern C++

Prefer C++17/20/23 over C idioms: `auto` when obvious, `constexpr`, structured bindings.

## RAII

No manual `new`/`delete`; `unique_ptr` default ownership; `shared_ptr` only when sharing is real; `make_unique` / `make_shared`.

## Naming

PascalCase types; snake_case or camelCase functions (match project); `kConstant` or `UPPER_SNAKE`; lowercase namespaces; trailing `_` or `m_` for members per repo rule.

## Format

**clang-format** before commit.

Depth: `techne:cpp` skill.
