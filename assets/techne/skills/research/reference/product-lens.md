# Product lens

Diagnosis and prioritization — not implementation-ready specs (**exo-pm** owns detailed PRD/backlog when needed).

## When

Before large features; choosing among ideas; pre-launch sanity check; turning vague idea into brief.

## Mode 1 — Product diagnostic

Hard questions:

1. Specific user (persona, not "developers").
2. Pain frequency/severity; current workaround.
3. Why now?
4. 10-star vision vs **MVP** proof point.
5. Anti-goals (explicit out-of-scope).
6. Success metric (measurable).

Output: `PRODUCT-BRIEF.md` with risks and **go / no-go / pivot**. Go → hand planning to **exo-pm** + engineering agents.

## Mode 2 — Founder review

Signals from README, CLAUDE.md, manifests, recent commits: inferred mission; PMF-ish score (usage, retention proxies, monetization hooks, moat); one 10× lever; waste to cut.

## Mode 3 — User journey audit

Install/try as new user; friction log with timings; time-to-first-value; top 3 onboarding fixes. Validate with **techne:quality** `browser-qa` when UI-heavy.

## Mode 4 — ICE prioritization

For each idea: Impact × Confidence ÷ Effort (1–5). Rank; apply runway/team/dependency constraints; output ordered roadmap with rationale.

## Output style

Actionable bullets — each recommendation ties to a next owner (design → **exo-designer**, build → stack skill, infra → **exo-infra**).

Visual polish questions → **ui-design** audit/harden, not this skill.
