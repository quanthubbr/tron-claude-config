---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/components/**/*.ts"
  - "**/app/**/*.ts"
  - "**/pages/**/*.ts"
---
> Extends [typescript/security.md](../typescript/security.md).

# React security

## HTML injection

Audit every `dangerouslySetInnerHTML` — prefer text nodes or sanitizing markdown renderers. If HTML is required, sanitize at the call site (allowlist tags).

## URLs

Block `javascript:` and suspicious `data:` in dynamic `href`/`src`. Add `rel="noopener noreferrer"` with `target="_blank"`.

## Server actions & APIs

Treat `"use server"` handlers like public endpoints: schema-validate input, authenticate, authorize per record, rate-limit destructive work.

## Client bundle exposure

Framework public env prefixes ship to browsers (`NEXT_PUBLIC_*`, `VITE_*`, etc.). Never place signing secrets there.

## Session storage

Prefer httpOnly secure cookies over `localStorage` session tokens (XSS exfiltration risk).

## CSP & SSR

Set CSP at the edge; use per-request nonces for inline scripts in SSR frameworks. Do not concatenate user input into HTML shells outside JSX.

## State merge attacks

Do not spread unvalidated JSON into React state — validate with Zod first.

## Maps in production

Do not publish full source maps to CDN; upload to error tracker if needed.

Escalate to **exo-security** / `security-review` before merge on auth/payment changes.
