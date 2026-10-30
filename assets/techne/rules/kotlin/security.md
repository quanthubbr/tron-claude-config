---
paths:
  - "**/*.kt"
  - "**/*.kts"
---
# Kotlin Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

Build-time fields from CI for non-runtime config; runtime tokens in encrypted storage (Android EncryptedSharedPreferences, iOS Keychain). No literals in source.

## Network

HTTPS only; cleartext blocked in network security config; pin certs for sensitive APIs; explicit HTTP client timeouts.

## SQL

Room/SQLDelight placeholders — never interpolated user strings in `@Query`.

## Data

Encrypt sensitive prefs; clear auth on logout; biometric gate for high-risk actions.

## Release

ProGuard/R8 keep rules for serialization and DI; smoke-test release builds.

## WebView

Disable JS unless required; validate URLs; narrow `@JavascriptInterface` surface.

Review: `security-review` skill / `exo-security` agent.
