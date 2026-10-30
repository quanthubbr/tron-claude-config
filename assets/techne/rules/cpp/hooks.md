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
# C++ Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS` select pre-commit automation.

## Local gate (standard/strict)

```bash
clang-format --dry-run --Werror src/*.cpp src/*.hpp
clang-tidy src/*.cpp -- -std=c++17
cmake --build build
ctest --test-dir build --output-on-failure
```

CI order: format → tidy → cppcheck → build → ctest (sanitizers on strict).
