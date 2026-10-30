---
name: deliver
description: Delivery workflow — classify → discuss → plan → execute → verify → close, run with the 12 exo-* agents, plan memories in project-memory and compact JSON reports. Use for any multi-step change ("implement", "build", "ship", "execute the plan", "fix this issue end to end", "plan this feature"), to resume a saved plan, or to see open plans. Replaces the old phase-workflow commands.
---

# deliver

One loop for every delivery, sized to the work. The session is the **coordinator**: it scopes packets, picks branches, judges gates and owns memory writes. It implements inline only when the work is Trivial.

```bash
M="node ~/.claude/skills/project-memory/project-memory.mjs"
```

| Call | Does |
|---|---|
| `/deliver <request>` | full loop |
| `/deliver plan <request>` | stop after the plan memory is saved |
| `/deliver resume [plan-id]` | continue a saved plan (no id → `$M list --kind plan --status open`, ask which) |
| `/deliver status` | open plans + their next step, nothing else |

## 0. Load context — cheap first

- `git status --short --branch`.
- `$M search "<topic>" --limit 5` for related plans/ADRs; `$M show` only the hits that change the work.
- Code locations: `atlas` (`search_graph` → `get_code_snippet`) or one `exo-researcher` navigator packet. Never pass agents a broad dump.

## 1. Classify — state it before any agent runs

| Class | When | Runs |
|---|---|---|
| **Trivial** | ≤ 5 files, one domain, no shared flow, no boundary, no auth/input/secrets | inline in the main thread → verify → close. No agents. |
| **Standard** | multi-file or cross-domain, no boundary change | plan → implementer(s) → `exo-qa` |
| **Complex** | module boundary, data model, new dependency, shared flow, or security surface | `exo-cto` (record ADR) → plan → implementers → `exo-qa` ∥ `exo-security` ∥ `exo-designer` as gates apply |

Also state the **branch strategy**: on `main`/`master` ask before creating `type/short-description`; one branch for direct/sequential work; one worktree per editing lane (`isolation: "worktree"`) for parallel work.

## 2. Discuss — only when something is genuinely ambiguous

Answer from code and memory first. Then ask one question at a time, each with a recommended answer. Record each decision that would be expensive to reverse as an `adr` as soon as the user settles it. Skip this step when the request is clear.

## 3. Plan

- Trivial: a TodoWrite list, `step → verify: <check>`. No memory.
- Standard/Complex: `exo-pm` (Complex: after `exo-cto`) returns tasks with **owner agent, files, done-check, dependencies, parallel marks**. The plan must be self-contained — an executor with zero context of this session must succeed with it.
- Save it: `$M add plan --title "<goal>" --body-file <plan.md> --tag <area> --link file:<main path>`. `/deliver plan` stops here and prints the plan id.

## 4. Execute

Pick the shape from real dependencies:

- **Direct** — one lane, one implementer chain on one branch.
- **Sequential** — tasks depend on earlier outputs; run lane by lane, gate between them.
- **Parallel** — independent lanes, no shared files; read `references/parallel.md` first.

Implementers by domain (opus): `exo-frontend`, `exo-backend` (default), `exo-mobile`, `exo-data-ai`, `exo-devops`, `exo-infra`. Independent agents go out in one message.

**Packet** (coordinator → agent), nothing else:

```
Goal: <one action sentence>
Plan: <plan-id> · task <n> — <excerpt of that task only>
Branch/worktree: <name>
Files in scope: <paths> · Do not touch: <paths>
Done when: <runnable checks>
Context: <navigator block / ADR ids that matter>
```

**Report** (agent → coordinator): first line `{"status":"done|partial|blocked","cause":"…","risks":["…"]}`, then files touched, evidence (command → result), findings `file:line — impact — fix`. The coordinator reads reports, not diffs.

## 5. Verify and review

Gate agents fetch the diff themselves (`git diff <base>...HEAD`) — the packet names the base and the acceptance criteria.

| Gate | When |
|---|---|
| `exo-qa` | every Standard/Complex change; runs types, lint, affected tests, the changed path |
| `exo-security` | auth, input handling, secrets, dependencies, data exposure changed |
| `exo-cto` | boundaries, abstractions or shared flows changed |
| `exo-designer` | visible UI changed |

Trivial: run the checks yourself and quote the output.

**Revision loop:** findings go back to the **same** implementer with `SendMessage` (its context is intact — never respawn). Stop and surface to the user, writing the blocker into the plan memory, when:
- 2 revision rounds are spent, or
- a round makes no progress on the gate it targeted, or
- the same failure repeats with the same cause.

## 6. Close

1. Milestones: `$M update <plan-id> --status in-progress --body-file <updated plan>` so progress survives the session.
2. Done and verified: record decisions as `adr` (with `--link`/`--evidence`); add a `doc` only when behavior genuinely needs explaining, written fresh. Then `$M remove <plan-id>`.
3. Follow-up work found along the way → a new `plan`, never silent scope growth.
4. `$M validate` when the change moved code that memories anchor to; fix what drifted.
5. Commit/PR only if the user asked: `/commit-changes`, then `/make-pr`. Mid-task pause → `/session-handoff`.

## Checklist

- [ ] Class and branch strategy stated before the first agent.
- [ ] Every agent got a packet, every report starts with the JSON line.
- [ ] Required gates ran, or were skipped with a stated reason.
- [ ] Revision rounds reused the same agent; stop conditions respected.
- [ ] Plan memory reflects reality: updated, removed, or holding the blocker.
- [ ] Real check output quoted — no claim without evidence.

## Old workflow commands

| Was | Now |
|---|---|
| quick task | `/deliver <request>` (classifies as Trivial) |
| discuss / plan phase | `/deliver plan <request>` |
| execute phase | `/deliver resume <plan-id>` |
| progress | `/deliver status` |
| debug | `diagnose` skill or a `exo-qa` debug packet |
| pause / resume work | `/session-handoff` |
