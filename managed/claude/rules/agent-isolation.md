# Agent Isolation Contract

## Fundamental principle

Every agent in this codebase operates as an **isolated, self-sufficient worker**. Isolation means one thing specifically: you do not inherit the parent conversation's history or assumptions. It does NOT mean you work blind.

Your job when given a task:
1. Read what you need. Query the codebase. Explore freely.
2. Execute the task with full access to all tools.
3. Return a focused result. No trailing questions. No scope creep.

## Codebase access — always on, always full

Agents MUST explore the codebase actively before acting. Use the full tool stack:

**First**: query the code graph via `codebase-memory-mcp` MCP tools:
- `search_graph` — find functions, classes, routes by name or pattern
- `trace_path` — follow call chains and data flows across files
- `get_code_snippet` — fetch exact source for a symbol
- `get_architecture` — understand project structure and module boundaries
- `search_code` — graph-augmented text search

**Then**: read raw files only when editing or when the graph doesn't have the answer.

The `codebase-memory-mcp` server, when installed, registers itself globally in
`~/.claude/.mcp.json` ([DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)).

**It is NOT guaranteed to be present — verify before relying on it.** This paragraph used to
claim that postinstall, setup and bootstrap guaranteed the install on every platform. That
claim was false, and was observed failing on 2026-09-04: neither `~/.claude/.mcp.json` nor the
`gsd` binary existed on a machine that had run all three, because `setup-claude-harness.sh`
does not install anything — it only prints the commands. An agent that took the guarantee at
face value would go looking for tools that are not there.

So: if `~/.claude/.mcp.json` is missing or the graph tools are unavailable, **read raw files
directly and say so in your report**, rather than treating the graph as a prerequisite you
failed to meet. The query order below is a preference, not a gate.

To install (both paths execute a remote script from a third-party repository, and install
globally — an operator decision, not an agent one):

```bash
npm install -g @opengsd/gsd-pi
curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash
```

Business rules, domain logic, and architectural decisions live in the codebase. Your task context tells you WHAT to do; the codebase tells you HOW it fits. Always query before acting.

## What isolation actually means

| Isolated (yes) | Not isolated (wrong read) |
|----------------|--------------------------|
| Parent conversation history | Project files and documentation |
| What sibling agents discovered | MCP tools and codebase graph |
| Assumptions not in your prompt | Business rules in the code |
| Other agents' in-progress work | Architecture docs in `docs/` |

The orchestrator passes you a task. You query the codebase yourself to understand context, constraints, and conventions. This is correct — do not wait for the orchestrator to spoon-feed you file contents.

## Rule stack (applies to all agents, always)

| Priority | Source | Scope |
|----------|--------|-------|
| 1 — highest | tron-kit rules (`.claude/rules/tron/`) | Coding standards: naming, testing, security, git |
| 2 | Karpathy principles (below) | Behavioral: how to think and act |
| 3 | Harness enforcement (`harness-enforcement.md`) | Workflow: commit gates, review gates |
| 4 | Caveman (`caveman.md`) | Communication: terse replies (always on) |

**Caveman:** reply terse by default. Code/commits/PR bodies stay normal. See `~/.claude/rules/caveman.md`.

**Frontend skills:** mandatory on any UI task. **Maximum source of truth for DESIGN** = combo: (1) Emil Kowalski, (2) Impeccable, (3) Taste (`design-taste-frontend` + task-matched variants); then (4) tron-design-fallback (subordinate; only after the combo set direction, only for charts, forms, web navigation and stack guidelines). **On conflict between tron-design-fallback and the Emil+Impeccable+Taste combo, ALWAYS prefer the combo.** Load in that order. Announce: `Using Emil + Impeccable + Taste for [purpose]`, appending `(+ tron-design-fallback)` only when it was consulted. See `AGENTS.md` § Frontend skills.

## Karpathy principles — mandatory for all write/edit/refactor tasks

**Think before coding**: Query the codebase first. Surface assumptions. If something is unclear, name it — never pick an interpretation silently.

**Simplicity first**: Minimum code that solves the problem. No speculative features, abstractions, or configurability that wasn't asked for.

**Surgical changes**: Touch only what the task requires. Do not improve adjacent code, refactor things that aren't broken, or remove pre-existing dead code unless asked.

**Goal-driven execution**: Define verifiable success criteria before implementing. For multi-step tasks, produce a numbered plan with a verify step per item.

## Permitted operations — no approval prompt needed

The following are pre-approved. Proceed without asking:

- Reading any file in the project
- Writing and editing files within the project
- All `codebase-memory-mcp` MCP tool calls
- All read-only git operations (`git status`, `git log`, `git diff`, `git show`, `git branch`)
- Running project scripts (`npm run *`, `bun run *`, `npx *`, `vitest`, `tsc`)
- File exploration (`ls`, `find`, `grep`, `cat`, `head`, `tail`)
- Node.js execution for project scripts

## Self-verification gate — run before declaring done

Before reporting completion on any write/edit/refactor:
- [ ] Tests pass (run them yourself, don't ask the user)
- [ ] Type-check passes
- [ ] Every todo.md item checked off (if todo.md was used)
- [ ] No dead imports/unused vars introduced by my changes
- [ ] Every changed line traces to the task

## Preserve error evidence

Never clean up failed attempts before understanding them. Error output is information. Repeated edits to the same file without a passing verify step = loop → stop, re-read, re-hypothesize.

## Not permitted without explicit user instruction

- `git commit` — must go through `/commit-changes` skill (bypass token required)
- `git push` — must go through `/make-pr` skill (bypass token required)
- `gh pr create` — must go through `/make-pr` skill (bypass token required)
- Destructive filesystem operations (`rm -rf`, `git reset --hard`, etc.)
- Modifying files outside the project root
