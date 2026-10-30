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
# C++ Security

> Builds on the shared rules in `../common/security.md`.

## Memory

Smart pointers; `std::vector` / `std::array` not C arrays; no `malloc`/`free` in app code; avoid `reinterpret_cast`.

## Strings

`std::string`, `.at()` when bounds matter; ban `strcpy`/`sprintf` — use safe formatters.

## UB hygiene

Initialize variables; no signed overflow; no dangling/null deref.

## CI sanitizers

```bash
cmake -DCMAKE_CXX_FLAGS="-fsanitize=address,undefined" ..
```

## Static analysis

clang-tidy and cppcheck on touched translation units.

Depth: `techne:cpp` skill.
