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
# C++ Patterns

> Builds on the shared rules in `../common/patterns.md`.

## RAII handles

Acquire in ctor, release in dtor; deleted copy/move when ownership is unique.

## Rule of Zero / Five

Prefer zero special members; if you customize one, define all five.

## Values

Small types by value; large by `const&`; return by value (RVO); move sinks.

## Errors

Exceptions for exceptional paths; `optional` for absence; `expected` (C++23) or result types for expected failures.

Depth: `techne:cpp` skill.
