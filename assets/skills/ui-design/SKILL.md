---
name: ui-design
description: Use for any frontend or UI design work—new surfaces, redesigns, critique, technical audit, polish, refinement, or live browser iteration. Covers landing pages, marketing, dashboards, product UI, shells, components, forms, settings, onboarding, empty states, hierarchy, accessibility, motion, typography, color, and design-system tokens. Not for backend-only or non-visual tasks.
user-invocable: true
argument-hint: "[shape · audit|critique · animate|bolder|colorize|delight|layout|overdrive|quieter|typeset · adapt|clarify|distill · harden|onboard|optimize|polish · init|document|extract|live] [target]"
---

Ship UI with a point of view: complete artifacts, brief-aligned craft, bounded verification (one batched desktop+mobile or native device capture pass, one fix batch, optional confirm—then hand off).

## Setup

1. Once per session: `<skill-dir>/scripts/ui-design context` (project cwd; optional `--target`). Obey directives; do not repeat context.
2. Open the playbook for the invoked subcommand (table below) or the new-work playbook for greenfield/rebrand. Inspect incumbent visuals first; use fixtures if runtime unavailable.
3. Before any UI edit post-direction: craft-floor playbook.

Context failure: one-line notice, then read `PRODUCT.md` / `DESIGN.md` without inventing facts.

## Principles

Brief overrides model taste. Refinement keeps identity; redesign replaces look via new-work + `DESIGN.md`. Missing design file ≠ blank slate—new-work decides.

## Visitor modes (per surface brief)

- **Persuade** — decision + action (marketing, landing)
- **Operate** — task completion (app, admin)
- **Read** — comprehension (docs)
- **Experience** — artifact-first (portfolio)

## Commands

| Cmd | Kind | Role | Playbook |
|-----|------|------|----------|
| shape | Build | Plan & brief | shape |
| init | Build | `PRODUCT.md` | init |
| document | Build | `DESIGN.md` capture | document |
| extract | Build | System consolidation | extract |
| critique | Eval | Heuristic UX review | critique |
| audit | Eval | Technical matrix | audit (+ native variant) |
| polish | Refine | Pre-ship pass | polish |
| bolder / quieter | Refine | Intensity dial | bolder / quieter |
| distill / harden / onboard | Refine | Simplify / prod / first-run | matching refs |
| animate / colorize / typeset / layout / delight / overdrive | Enhance | Targeted lift | matching refs |
| clarify / adapt / optimize | Fix | Copy / responsive / perf | matching refs |
| live | Iterate | Browser variants | live |

Playbooks live under `reference/<name>.md` except native audit/adapt suffix `.native.md`.

### Routing

Bare invoke → routing playbook menu (never auto-run). Named cmd → load playbook. Workflow questions → routing §workflow. Else general design; missing product file → init then new-work; narrow tweak follows context.

`teach` = init. After init, skip context rerun; native platform refs load from init when needed.

Pin: `<skill-dir>/scripts/ui-design pin …`. Hooks: `/ui-design hooks …` → hooks playbook. Doctor: `/ui-design doctor` → doctor playbook. Report `CONTEXT_STALE`; never silent repair unless user asks or `auto` severity.

## Style modules

| File | Use |
|------|-----|
| styles/direction | Anti-generic art direction |
| styles/premium | Agency-grade polish |
| styles/minimalist | Editorial restraint |
| styles/brutalist | Raw/industrial |
| styles/redesign | Brownfield upgrade lens |
| styles/design-md | Authoring design-system docs |
| styles/full-output | No truncated deliverables |

Paths: `reference/styles/<file>.md`.

## Companion skills

**ui-motion** (motion/web+Expo), **native-ui** (platform HIG), **ui-mockup** (comps/generation), **ui-patterns** (charts/forms/nav/stack only—loses conflicts to ui-design).

Agents: **exo-designer**, **exo-frontend**, **exo-mobile**. Dedicated finish/asset/doc/manual roles → spawn **exo-designer** with `reference/degraded/<role>.md` or run that brief in-thread if subagents unavailable.
