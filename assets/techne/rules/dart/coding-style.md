---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
  - "**/analysis_options.yaml"
---
# Dart/Flutter Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

## Format

`dart format` in CI (`--set-exit-if-changed`); 80 columns; trailing commas on multiline lists.

## Immutability

`final` locals; `const` when compile-time; unmodifiable collections from public APIs; `copyWith` on state classes.

## Naming

Dart style: camelCase members, PascalCase types, snake_case files, `_` private, descriptive extension names.

## Null safety

Avoid `!` and careless `late`; use `?.`, `??`, guards, or Dart 3 patterns; `required` ctor params.

## Sealed state (Dart 3+)

Closed hierarchies with exhaustive `switch` — no default branch on sealed roots.

## Errors

Typed `on` clauses; never catch bare `Error`; sealed/`Result` for recoverable failures.

## Async

Await or `unawaited()`; no fake `async`; `context.mounted` after awaits in widgets.

## Imports

`package:` imports across layers; order dart → external → own package.

## Codegen

Commit or ignore `.g.dart`/`.freezed.dart` consistently; never hand-edit generated files.

Depth: `techne:flutter` skill.
