---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
> Builds on the shared rules in `../common/security.md`.

# React Native security

Assume JS bundle is public — no privileged keys in app binary. Anon keys OK only with server-enforced rules.

Tokens in Secure Store; not AsyncStorage/MMKV for secrets. HTTPS; validate API + deep link + push payloads with Zod.

Minimal permissions with rationale; accurate store privacy labels.

**exo-security** for review — not third-party agent-config scanners.
