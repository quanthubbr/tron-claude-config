---
paths:
  - "**/*.dart"
  - "**/pubspec.yaml"
  - "**/AndroidManifest.xml"
  - "**/Info.plist"
---
# Dart/Flutter Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

No literals; `--dart-define` for non-secret config; runtime secrets in **flutter_secure_storage**; server holds true secrets.

## Network

HTTPS only; platform cleartext blocked; client timeouts; optional pinning for sensitive APIs.

## Input

Parameterized SQL (sqflite/drift); validate deep links (`Uri.tryParse`, allowlisted hosts/paths) before `go`.

## Storage

No tokens in SharedPreferences plaintext; wipe auth on logout; `local_auth` for sensitive actions; never log secrets.

## Android

Minimal permissions; `exported=false` where possible; `FLAG_SECURE` on sensitive screens.

## iOS

Usage strings only for used capabilities; Keychain via secure storage; ATS enforced.

## WebView

Prefer current `webview_flutter` controller API; disable JS unless required; intercept navigation.

## Release

`flutter build --obfuscate --split-debug-info=...`; analyze clean before ship.

Review: `security-review` skill / `exo-security` agent.
