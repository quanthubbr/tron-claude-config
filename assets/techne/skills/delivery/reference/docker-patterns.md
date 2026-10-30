# Docker and Compose

## Local stack (Compose)

Typical web app: `app` (bind mount + anonymous `/app/node_modules`), `db` (named volume + healthcheck), `redis`, optional mail catcher.

```yaml
services:
  app:
    build: { context: ., target: dev }
    ports: ["3000:3000"]
    volumes: [".:/app", "/app/node_modules"]
    depends_on:
      db: { condition: service_healthy }
  db:
    image: postgres:16-alpine
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 5
```

Dev vs prod Dockerfile targets: `dev` (hot reload), `production` (minimal layers). Override files: `docker-compose.override.yml` auto-loaded; prod via `-f docker-compose.yml -f docker-compose.prod.yml`.

## Networking

Services resolve each other by **service name** on the default network. Split `frontend-net` / `backend-net` so DB is not reachable from front-tier containers. Bind DB port to `127.0.0.1:5432:5432` on laptop only; omit host ports in shared prod-like compose.

## Volumes

- **Named volume** — persistent DB data.
- **Bind mount** — source hot reload.
- **Anonymous volume** — shield container `node_modules` from host overwrite.

## Hardening

Dockerfile: pin digest or minor tag (`node:22-alpine`), non-root UID, no secrets in `ENV`.

Compose optional:

```yaml
security_opt: [no-new-privileges:true]
read_only: true
tmpfs: [/tmp]
cap_drop: [ALL]
```

Secrets: `.env` gitignored or runtime injection — never literal keys in YAML committed to git.

## Isolated CLI / installer tests

For testing install scripts without mutating the host checkout:

- Mount repo **read-only**; copy fixture to writable `tmpfs` workspace.
- Pin base image digest; non-root UID; `read_only`, `cap_drop: [ALL]`, `pids_limit`.
- Default **no network**; opt-in profile only when a test truly needs it.
- Invoke tools with `shell: false` and argv arrays — no interpolated paths in shell strings.
- **Linux containers do not emulate macOS/Windows** — run host-native checks on those OSes in CI matrix.

## `.dockerignore`

Exclude `.git`, `node_modules`, `.env*`, `dist`, `coverage`, tests/docs not needed at runtime.

## Debug commands

```bash
docker compose logs -f app
docker compose exec app sh
docker compose up --build
docker compose down          # add -v only when intentional data wipe
```

DNS/connectivity: `docker compose exec app wget -qO- http://peer:port/health`

## Anti-patterns

One container running DB + app + queue; `:latest` tags; root user; prod orchestration replaced by lone Compose on multi-node fleet without ops plan.
