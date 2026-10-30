# Architecture decision records (ADRs)

Capture **why** the system looks the way it does. **exo-cto** owns ADR quality and approval; agents propose, humans accept.

## Primary tool

**atlas MCP `manage_adr`** — create, list, update status, link supersession. Prefer MCP over ad-hoc files when the project index supports ADRs.

Fallback layout many repos use:

```
docs/adr/
  README.md          # index table
  0001-title.md
  template.md
```

Initialize `docs/adr/` only with **explicit user consent**.

## When to record

Explicit: "record this decision", "ADR". Implicit suggestions (confirm first): framework/db/API/auth/deployment choice after alternatives discussed; "we chose X because Y".

Trivial style choices do not need ADRs.

## Lightweight format

```markdown
# ADR-NNNN: Title
**Date** | **Status**: proposed | accepted | deprecated | superseded by ADR-XXXX

## Context
Forces and constraints (short).

## Decision
Clear statement.

## Alternatives considered
Each: pros, cons, why rejected.

## Consequences
Positive, negative, risks + mitigations.
```

Present draft → write only after approval. Update index/status when superseding.

## Lifecycle

`proposed` → `accepted` → `deprecated` or `superseded` (link successor).

Reading "why X?": query `manage_adr` / scan index; if none, offer to capture now.

## Good ADR habits

Specific ("PostgreSQL + Prisma" not "a database"); honest trade-offs; rejected options documented; ≤~2 min read; present tense for current decisions.

## Categories (examples)

Technology, boundaries (monolith/microservices), API surface, data model, infra/CI, security auth, testing strategy, release/branch policy (may overlap **techne:delivery** — cross-link).

## Integration

**exo-cto** + `get_architecture` before proposing. **exo-qa** may flag architectural drift in review without ADR — suggest recording.

Do not auto-create ADRs from casual chat; user or CTO confirms.
