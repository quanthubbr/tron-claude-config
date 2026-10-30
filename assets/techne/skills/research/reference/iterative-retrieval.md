# Iterative retrieval

Solves subagents starting with too little or too much context.

## Problem

- All files → token overflow.
- None → wrong assumptions.
- One-shot guess → misses domain terms.

## Loop (max 3 cycles)

```
DISPATCH → EVALUATE → REFINE → (repeat)
```

### Dispatch

Broad patterns + keywords + excludes (tests, generated dirs):

- Patterns: `src/**/*.ts`, route folders, `internal/**`
- Keywords: user task terms + synonyms
- Excludes: `*.test.*`, `dist`, vendor

Use **atlas** `search_graph` / `search_code` first; fall back to ripgrep.

### Evaluate

Score each hit 0–1 vs task:

| Band | Meaning |
|------|---------|
| 0.8–1.0 | Directly implements target |
| 0.5–0.7 | Related types/patterns |
| 0.2–0.4 | Tangential |
| 0–0.2 | Drop |

Note **missingContext** gaps (e.g. "need middleware chain").

### Refine

Add keywords discovered in high-scoring files; exclude dead paths; add `focusAreas` from gaps.

### Stop condition

≥3 files ≥0.7 relevance and no critical gap, OR three cycles exhausted — return best set, not maximal set.

## Example (bug fix)

Cycle 1: `token`, `auth` → `session.ts` 0.9, `profile.ts` 0.2 (exclude).

Cycle 2: add `jwt`, `refresh` → `jwt-helper.ts` 0.85 — sufficient.

## Agent prompt snippet

When retrieving for a task: start broad, score files, list gaps, refine up to 3 times, return paths ≥0.7 with one-line rationale each.

## Practices

Learn project vocabulary on cycle 1; exclude confidently; prefer "good enough" context over exhaustive tree reads.

Related: **codebase-memory** / **atlas** indexing after structural refactors (`detect_changes` → `index_repository`).
