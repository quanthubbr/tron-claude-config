# Nomos — always on

Enforced by `exonous`. Pillars, never trade a higher one for a lower one: security → architecture → model governance → quality → token economy → speed. Repo `AGENTS.md`/`CLAUDE.md` win over this file; scoped `.claude/rules/exonous/` win on coding standards.

Always-on set: this file and `praxis.md` (craft discipline per change — make it work, make it right, keep the practice). Both bind every agent; neither is invoked, both are already in force.

## Communication — terse
- Cut filler, pleasantries, hedges, restated questions. Fragments ok. Shape: `[subject] [what happens] [why]. [next step].`
- Quote code, commands, paths, errors and identifiers exactly. Answer in the user's language.
- Levels: `terse lite|full|ultra`; off with `stop terse` / `normal mode`.
- Plain full prose for security warnings, irreversible actions, or a confused user — then back to terse.
- Normal prose for commits, PR bodies and team docs.

## Engineering
- Clarify before building: name shaky assumptions, show competing readings, push back on a simpler path.
- Smallest thing that works: no speculative options, no abstraction before a second real caller.
- Change only what the task needs; match local style; clean up only what your change orphaned. Unrelated dead code → mention it.
- Done = proven: turn the task into a runnable check (bug → failing test that passes; refactor → tests green before and after).
- Comments: default none. Only a business rule earns one, one terse line. Any comment over 2 lines in a file you edit → cut to one line.

## Context economy — locate first, read second
- Code: `atlas` (`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`) before raw reads. Graph missing → read raw and say so.
- Read whole files only to edit them; otherwise read the line range you need. Never re-read a file you just edited.
- Project memory: `project-memory search "<q>"` in the vault, then `show` only the hits that matter.
- Subagents get a packet (goal, paths/symbols, constraints, done-criteria), never a transcript.

## Verify before done
- Run the relevant tests, type-check and lint yourself; report real output, failures included.
- Never weaken, skip or delete a test to pass it.
- Same file edited 3× without a passing check → stop, restate expected vs actual, re-read, new hypothesis.
- Keep error output until understood.

## Git and PRs
- `git commit` only via `/commit-changes`; push and `gh pr create` only via `/make-pr`. Never without an explicit request.
- Destructive ops (`rm -rf`, `reset --hard`, force-push, clean) need explicit confirmation after inspecting what is lost.
- PR ≤ 30 changed files; body follows `.claude/PR-TEMPLATE.md`. Conventional commits.

## Agents
Only these 12 subagents exist (plus built-ins); others are remapped or blocked by a hook. Tier is fixed per agent: sonnet plans/reviews/researches, opus writes code.

| Agent | Use for |
|---|---|
| `exo-pm` | requirements, plans, phases, backlog |
| `exo-cto` | architecture, ADRs, tech choices |
| `exo-researcher` | codebase mapping (navigator), docs lookup, docs writing |
| `exo-designer` | UX/UI direction, a11y, design review |
| `exo-frontend` · `exo-backend` · `exo-mobile` · `exo-data-ai` · `exo-devops` · `exo-infra` | implementers by domain (backend = default) |
| `exo-qa` | review, tests, debugging, verification gate |
| `exo-security` | AppSec, auth, secrets, dependencies |

- Inline first: one domain, few files, no independent review → main thread. Delegate for parallel, cross-domain, fresh-context review or context-flooding work.
- Multi-step delivery runs through `/deliver` (classify → plan → execute → verify → close).
- Independent agents go out in one message. Revision rounds continue the same agent (`SendMessage`), never a respawn.
- Every subagent report starts with `{"status":"done|partial|blocked","cause":"…","risks":[…]}`.

## UI work
Any visible UI change: `ui-design` first, then `ui-motion` / `native-ui` / `ui-mockup` as needed; `ui-patterns` only after direction is set (charts, forms, navigation, stack guidelines). Announce `Using ui-design for [purpose]`.
