---
paths:
  - "**/*.ets"
  - "**/*.ts"
  - "**/module.json5"
---
# HarmonyOS / ArkTS Security

> Builds on the shared rules in `../common/security.md`.

## Permissions

Declare in `module.json5` with user-visible `reason` strings; request runtime grants for sensitive APIs; check before call with graceful denial handling.

## Secrets

No keys in source; non-sensitive endpoints via build profiles; sensitive material via HUKS/Keystore patterns — not Preferences.

## Input

Validate before navigation (allowlisted deep-link paths); sanitize before display.

## Network

HTTPS; cert validation; timeouts/retries; never log tokens or credentials.

## Storage

Encrypt sensitive local data; clear on logout; classify data before choosing storage API.

## Dependencies

Official ohpm registry; pin versions; review third-party updates.

Review: `security-review` skill / `exo-security` agent.
