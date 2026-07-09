# Agent Contract

This file defines how AI agents operate in this repository. Every agent — main or subagent — follows this contract automatically via the global rules installed by `@tron/claude-config`.

---

## Isolation model

Each agent is a **stateless worker**. It receives a bounded task and executes it completely. It does not:

- Assume context from a parent conversation unless explicitly passed in its prompt
- Share state or assumptions with sibling agents
- Expand scope beyond its assigned task
- Ask for approval on standard operations — the task carries that authority

Return a focused result. No trailing questions. No scope creep.

---

## Rule stack

All agents in this repo have access to the full rule stack, applied in this priority order:

| Priority | Layer | Source | What it governs |
|----------|-------|--------|-----------------|
| 1 | **ECC rules** | `~/.claude/rules/ecc/` | Coding standards: naming, testing, security, git workflow |
| 2 | **Karpathy principles** | `~/.claude/rules/agent-isolation.md` | Behavior: simplicity, surgical changes, goal-driven execution |
| 3 | **Harness enforcement** | `~/.claude/rules/harness-enforcement.md` | Workflow: commit gates, review gates, approval flow |

When rule layers conflict: higher priority wins.
When skill layers conflict: Karpathy > ECC.

---

## Karpathy principles

Applied automatically to every write/edit/refactor task:

**1. Think before coding** — Surface assumptions. Name confusion. Never pick an interpretation silently. If multiple paths exist, present them.

**2. Simplicity first** — Minimum code that solves the problem. No speculative features, abstractions, or configurability beyond what was asked. If the same result fits in half the lines, write the shorter version.

**3. Surgical changes** — Touch only what the task requires. Do not improve adjacent code, refactor things that aren't broken, or remove pre-existing dead code unless explicitly asked. Every changed line should trace directly to the task.

**4. Goal-driven execution** — Define verifiable success criteria before implementing. For multi-step tasks:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
```

---

## Permitted operations

The following are pre-approved — agents proceed without asking:

| Category | Operations |
|----------|-----------|
| File access | Read, Write, Edit any project file |
| Git (read-only) | `git status`, `git log`, `git diff`, `git show`, `git branch`, `git stash list` |
| Build / test | `npm run *`, `bun run *`, `npx *`, `vitest`, `tsc`, `vue-tsc` |
| Exploration | `ls`, `find`, `grep`, `cat`, `head`, `tail`, `wc` |
| Node scripts | `node *` for project tooling |

## Not permitted without explicit user instruction

| Operation | Why |
|-----------|-----|
| `git commit` | Must use `/commit-changes` skill (runs code review + security review first) |
| `git push` / `gh pr create` | Must use `/make-pr` skill |
| Destructive FS ops (`rm -rf`, etc.) | Irreversible — confirm with user |
| Files outside project root | Out of scope |

---

## Commit and PR flow

```
agent wants to commit
  → creates .claude/.commit-authorized
  → runs /commit-changes skill
    → /code-review
    → /security-review
    → git commit (hook reads token, permits, deletes token)

agent wants to open PR
  → creates .claude/.pr-authorized
  → runs /make-pr skill
    → gh pr create (hook reads token, permits, deletes token)
```

Direct `git commit` or `gh pr create` without the token is blocked by the git hooks.
