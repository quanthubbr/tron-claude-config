# Deployment and CI/CD

## Rollout strategies

| Strategy | Behavior | Use |
|----------|----------|-----|
| **Rolling** | Replace instances gradually | Default; needs backward-compatible API/schema |
| **Blue-green** | Two envs; flip traffic | Fast rollback; 2× capacity during cutover |
| **Canary** | Small traffic % to new version | High risk or high traffic; needs metrics + split routing |

## Pipeline shape

**On PR:** lint → typecheck → unit tests → integration (if cheap) → preview deploy optional.

**On merge to `main`:** same gates → build immutable artifact (container digest or static bundle) → deploy staging → smoke → production with approval gate.

GitHub Actions sketch: `test` job → `build` (push to registry with `sha` tag) → `deploy` (environment protection). Cache deps; upload coverage artifacts on failure.

## Production images (language examples)

Multi-stage pattern: deps → build → minimal runtime; non-root user; `HEALTHCHECK` hitting HTTP `/health`.

Node: `npm ci`, build, `npm prune --production`, run `node dist/server.js`.

Go: static binary `CGO_ENABLED=0`, `alpine` + `ca-certificates`.

Python: slim base, `gunicorn`/ASGI worker count matched to CPU.

## Health endpoints

- **`/health`**: liveness — process up (200).
- **`/ready`**: readiness — DB/cache dependencies OK (503 if not).

Detailed internal monitor may aggregate dependency latencies; do not expose secrets in JSON.

## Environment

Twelve-factor: all config via env vars. Validate at boot (e.g. Zod/schema) and exit non-zero on invalid production config.

## Rollback

| Platform | Action |
|----------|--------|
| Kubernetes | `kubectl rollout undo deployment/app` |
| PaaS | platform rollback to previous deployment id |
| DB | reversible migrations only; document forward-fix if not |

Checklist: previous artifact tagged; feature flags can disable new paths; alerts on error-rate spikes; rollback rehearsed in staging.

## Production readiness (summary)

**App:** tests pass; no secrets in repo; structured logs without PII; errors handled.

**Infra:** pinned versions; CPU/memory limits; TLS; autoscaling bounds documented.

**Ops:** runbook; on-call path; migration tested on realistic data volume.

**Security:** dependency CVE review; CORS/rate limits/auth verified — escalate to **security-review** / **exo-security** when scope is broad.
