---
paths:
  - "**/*.java"
  - "**/pom.xml"
  - "**/build.gradle"
  - "**/build.gradle.kts"
---
# Java Hooks

> Builds on the shared rules in `../common/hooks.md`.

`EXONOUS_HOOK_PROFILE` (`minimal` | `standard` | `strict`); `EXONOUS_DISABLED_HOOKS` for opt-out ids.

## PostToolUse

- **google-java-format** on edited `.java`
- **checkstyle** when the project enables it
- **`./mvnw compile`** or **`./gradlew compileJava`** after structural edits (strict profile)
