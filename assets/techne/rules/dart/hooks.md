---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
  - "**/analysis_options.yaml"
---
# Dart/Flutter Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` / `EXONOUS_DISABLED_HOOKS`.

## PostToolUse

- **dart format** on edited `.dart`
- **dart analyze** (fatal infos when strict)
- **flutter test** for risky UI/state edits (strict)

## Pre-commit (standard/strict)

```bash
dart format --set-exit-if-changed .
dart analyze --fatal-infos
flutter test
dart run build_runner build --delete-conflicting-outputs  # when generators touched
```
