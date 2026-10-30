---
description: Find and remove dead code safely, verifying with the test suite after every single removal.
---

# /refactor-clean

Delete what nothing uses, one verified step at a time. Cleaning and refactoring are separate passes.

## 1. Find candidates

| Stack | Tool |
|---|---|
| JS/TS | `npx knip` (files, exports, deps); `npx depcheck` for deps only |
| Python | `vulture <src>` |
| Go | `deadcode ./...` |
| Rust | `cargo +nightly udeps` (deps); compiler `dead_code` warnings |

No tool available → search for exported symbols with zero importers (the `atlas` MCP `search_graph` / `trace_path` answers this faster than grep).

## 2. Classify

| Risk | Typical items | Handling |
|---|---|---|
| Low | private helpers, unused test fixtures, internal functions | remove |
| Medium | components, routes, middleware, CLI commands | first rule out dynamic loading and external callers |
| High | entry points, config, public types, package exports | investigate; usually ask before touching |

For medium-risk items check: dynamic `import()` / `require()` / `__import__`, names referenced as strings (routers, DI containers, config files, templates), the package's public API surface, and known downstream consumers.

## 3. Removal loop

1. Suite green before you start (baseline).
2. Remove one item.
3. Rerun tests (and build/type check).
4. Red → undo that removal with an edit and mark the item skipped. Never discard unrelated working-tree changes.
5. Green → next item.

## 4. Consolidate (optional, after cleaning)

Merge near-identical functions, collapse duplicate type definitions, inline wrappers that add nothing, drop pass-through re-exports — each as its own verified step.

## 5. Report

Counts of removed functions, files and dependencies; skipped items with the failing test; approximate lines removed; final suite status.

Rules: never remove without a green baseline; one removal per verification; when unsure, keep it.
