# Codebase onboarding

For new repos, "explain this codebase", or seeding/updating project `CLAUDE.md`.

## Phase 1 — Recon (parallel, shallow)

- Manifests: `package.json`, `go.mod`, `pyproject.toml`, `Cargo.toml`, etc.
- Framework fingerprints: `next.config`, `nuxt.config`, `vite.config`, Django/FastAPI/Rails entry patterns.
- Entry points: `main`, `index`, `cmd/`, `src/main`.
- Tree depth ~2 (skip `node_modules`, `.git`, build dirs).
- Tooling: ESLint/Prettier/tsconfig, Dockerfile, `.github/workflows`, `.env.example`.
- Tests layout: `tests/`, `__tests__/`, `*_test.go`, runner configs.

Prefer glob/list + **atlas** `get_architecture` over reading every file.

## Phase 2 — Architecture map

Infer: languages/versions, frameworks, datastore/ORM, CI platform, monolith vs monorepo vs services, API style (REST/GraphQL/gRPC).

Directory → purpose table (project-specific, not generic `src/` fluff).

Trace one request: router → validation → service/domain → persistence.

## Phase 3 — Conventions

Naming (files, tests), error style, DI vs direct imports, async idioms. Git: recent branch names and commit subjects if history available; note if shallow clone prevents detection.

## Phase 4 — Artifacts

**Onboarding guide** (~2 min scan): overview, stack table, entry points, directory map, common commands (from scripts/Makefile), "where to look" table.

**CLAUDE.md**: merge with existing — preserve project rules; add detected commands, structure, test invocation; keep ≤~100 lines focused on how agents should work here.

Flag unknowns explicitly.

## Vault / session

Read project + vault `CLAUDE.md` when house rules require; resume prior work via **`/session-handoff`**.

## Anti-patterns

Dependency laundry list; duplicating README; guessing frameworks contradicted by code; replacing a rich CLAUDE.md wholesale.

Examples: full onboarding → guide + CLAUDE.md; CLAUDE-only request → phases 1–3 without long guide.
