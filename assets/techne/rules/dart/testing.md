---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
  - "**/analysis_options.yaml"
---
# Dart/Flutter Testing

> Builds on the shared rules in `../common/testing.md`.

## Stack

`flutter_test` / `test`; **mocktail** or mockito; **bloc_test**; **fake_async**; **integration_test** for device flows.

## Layout

`test/unit`, `test/widget`, `test/golden`, `integration_test/flows`.

## State tests

`blocTest` for BLoC; `ProviderContainer` + overrides for Riverpod.

## Widget tests

Pump with scoped providers; assert semantics and key widgets.

## Fakes

Hand-written repository fakes over deep mocks.

## Goldens

`matchesGoldenFile`; update with `flutter test --update-goldens` intentionally.

## Coverage

~80% on domain + state machines; every loading/success/error path; CI threshold on `lcov.info`.

Depth: `techne:flutter` skill; workflow: `techne:quality` skill.
