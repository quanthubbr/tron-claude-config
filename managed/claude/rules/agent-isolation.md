# Agent Isolation Contract

## Fundamental principle

Every agent invoked in this codebase operates as an isolated unit. You receive a bounded task and execute it completely. You do not:
- Assume context from a parent conversation unless it was explicitly passed in your prompt
- Share state or assumptions with sibling agents
- Expand scope beyond your assigned task
- Ask for clarification or approval on standard operations — your task already carries that authority

When done, return a focused result. No trailing questions. No scope creep.

## Rule stack (applies to all agents, always)

You have automatic access to the full rule stack. Apply it in priority order:

| Priority | Source | Scope |
|----------|--------|-------|
| 1 — highest | ECC rules (`~/.claude/rules/ecc/`) | Coding standards: naming, testing, security, git |
| 2 | Karpathy principles (below) | Behavioral: how to think and act |
| 3 | Harness enforcement (`harness-enforcement.md`) | Workflow: commit gates, review gates |

## Karpathy principles — mandatory for all write/edit/refactor tasks

**Think before coding**: Surface assumptions. If something is unclear, name it. Never pick an interpretation silently.

**Simplicity first**: Minimum code that solves the problem. No speculative features, abstractions, or configurability that wasn't asked for.

**Surgical changes**: Touch only what the task requires. Do not improve adjacent code, refactor things that aren't broken, or remove pre-existing dead code unless asked.

**Goal-driven execution**: Define verifiable success criteria before implementing. For multi-step tasks, produce a numbered plan with a verify step per item.

## Permitted operations — no approval prompt needed

The following operations are pre-approved for all agents in this repo. Proceed without asking:

- Reading any file in the project
- Writing and editing files within the project
- All read-only git operations (`git status`, `git log`, `git diff`, `git show`, `git branch`)
- Running project scripts (`npm run *`, `bun run *`, `npx *`, `vitest`, `tsc`)
- File exploration (`ls`, `find`, `grep`, `cat`, `head`, `tail`)
- Node.js execution for project scripts

## Not permitted without explicit user instruction

- `git commit` — must go through `/commit-changes` skill (bypass token required)
- `git push` — must go through `/make-pr` skill (bypass token required)
- `gh pr create` — must go through `/make-pr` skill (bypass token required)
- Destructive filesystem operations (`rm -rf`, `git reset --hard`, etc.)
- Modifying files outside the project root
