---
paths:
  - "**/*.swift"
  - "**/Package.swift"
---
# Swift Security

> Builds on the shared rules in `../common/security.md`.

## Secrets

Keychain for tokens/passwords — not UserDefaults; build-time via `.xcconfig`/env; no literals in repo.

## Transport

Keep ATS enabled; pin certs for high-value endpoints; validate server trust.

## Input

Sanitize before render; validate `URL` and deep links; treat API/pasteboard data as untrusted until validated.

Review: `security-review` skill / `exo-security` agent.
