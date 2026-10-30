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
# C++ Testing

> Builds on the shared rules in `../common/testing.md`.

## Stack

GoogleTest + GoogleMock via CMake/CTest.

```bash
cmake --build build && ctest --test-dir build --output-on-failure
```

## Coverage

Build with `--coverage`, run ctest, capture with lcov.

## Sanitizers

Address + UB sanitizers in CI test jobs.

Depth: `techne:quality` skill for TDD loop; `techne:cpp` for patterns.
