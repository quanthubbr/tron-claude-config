# Agent Contract

How AI agents work in this repository. Installed by `exonous`; the full rule set lives in `~/.claude/rules/nomos.md` (Cursor: `~/.cursor/rules/nomos.mdc`) plus the scoped coding rules in `.claude/rules/exonous/`. This file's repo-specific rules win over both.

## Every agent

- No inherited conversation: query the codebase yourself — `atlas` (`search_graph`, `trace_path`, `get_code_snippet`, `get_architecture`) first, raw reads only to edit or when the graph misses.
- Past decisions and plans: `project-memory search "<topic>"`, then `show` only the hits that matter.
- Stay in the task's scope; out-of-scope findings are one line in the report.
- Reports start with `{"status":"done|partial|blocked","cause":"…","risks":[…]}`, then evidence (command → result).
- Terse replies; normal prose for commits, PR bodies and docs. Code comments only for business rules, one terse line.
- UI work: `ui-design` stack first; `ui-patterns` only after direction is set.

## Delivery

Multi-step work runs through `/deliver` (classify → plan → execute → verify → close) with the 12 `exo-*` agents. Trivial changes stay inline.

## Permitted without asking

| Category | Operations |
|---|---|
| Files | Read, Write, Edit project files |
| Git (read-only) | `git status`, `log`, `diff`, `show`, `branch`, `stash list` |
| Build / test | `npm run *`, `bun run *`, `npx *`, `vitest`, `tsc`, `vue-tsc` |
| Exploration | `ls`, `find`, `grep`, `cat`, `head`, `tail`, `wc`; `node *` for project tooling |

## Needs an explicit request

| Operation | Path |
|---|---|
| `git commit` | `/commit-changes` (security review + code review, then a one-shot token) |
| `git push`, `gh pr create` | `/make-pr` |
| Destructive filesystem or git ops | confirm with the user after inspecting what is lost |
| Files outside the project root | out of scope |

## Commit and PR gates

```
/commit-changes → /security-review → /code-review → token .claude/.commit-authorized → git commit (hook consumes token)
/make-pr → ≤ 25 changed files → body from .claude/PR-TEMPLATE.md
        → node .claude/hooks/lib/validate-pr-body.cjs .claude/.pr-body-draft.md
        → gh pr create --body-file .claude/.pr-body-draft.md (hook checks the 5 titles + file count)
```

Direct `git commit` without the token and non-conforming `gh pr create` are blocked by hooks.
