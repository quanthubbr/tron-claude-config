# Security baseline

No secrets in repo; validate input; parameterized SQL; XSS/CSRF controls; server-side authz; rate limits; safe errors.

Secrets via env/secret manager. On finding: stop, **exo-security** / `security-review`, fix CRITICAL, rotate credentials, sweep similar code.
