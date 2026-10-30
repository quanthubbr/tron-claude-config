---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
---
# Dart/Flutter Patterns

> Builds on the shared rules in `../common/patterns.md`.

## Repository

Abstract interface + impl coordinating remote/local sources; `Future` for fetches, `Stream` for watch APIs.

## State

Pick one primary approach per feature: **Cubit/BLoC** (events → emit), **Riverpod** (`@riverpod`, notifiers, `ConsumerWidget`), or **ChangeNotifier** view models with sealed/async state.

## DI

Constructor injection; register at composition root (`get_it` or Riverpod providers).

## Use cases

Single-purpose classes with `call()` forwarding to repositories.

## Layers

`domain/` (pure Dart) → `data/` (DTOs, sources) → `presentation/` (widgets + state). Presentation calls use cases, not stores directly.

## Navigation

GoRouter with validated params; auth redirects via `refreshListenable` + redirect callback.

## Immutability

`freezed` or manual immutable state classes for complex UI state.

Depth: `techne:flutter` skill; shared mobile patterns also in `techne:kotlin` for KMP overlap.
