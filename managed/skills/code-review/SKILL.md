---
description: Code review — local uncommitted/staged changes or GitHub PR (pass PR number/URL for PR mode)
argument-hint: [pr-number | pr-url | blank for local review]
model: sonnet
---

# Code Review

**Input**: $ARGUMENTS

Required by `@tron/claude-config` `/commit-changes`. Run against the staged or branch diff before committing. Block the commit path if CRITICAL or HIGH findings remain unfixed.

---

## Mode Selection

If `$ARGUMENTS` contains a PR number, PR URL, or `--pr`:
→ Jump to **PR Review Mode** below.

Otherwise:
→ Use **Local Review Mode**.

---

## Local Review Mode

### Phase 1 — GATHER

```bash
git status --short
git diff --name-only HEAD
git diff --staged --name-only
```

Prefer reviewing **staged** changes when present; otherwise review the full working-tree diff vs `HEAD`. If nothing changed, stop: "Nothing to review."

### Phase 2 — REVIEW

Read each changed file (full file when practical; otherwise hunks + surrounding context). Check for:

**Security Issues (CRITICAL):**
- Hardcoded credentials, API keys, tokens
- SQL/command injection
- XSS / unsanitized HTML
- Missing input validation on trust boundaries
- Path traversal / unsafe file access
- Secrets in logs or error messages

**Correctness & Quality (HIGH):**
- Logic errors, null/edge cases, race conditions
- Missing error handling
- Broken TypeScript types / use of `any` where forbidden by project rules
- Debug leftovers (`console.log`, debugger)

**Best Practices (MEDIUM / LOW):**
- Missing tests for new business logic
- Unclear naming, deep nesting, dead code
- Accessibility issues on UI changes

### Phase 3 — REPORT

Produce a compact report:

| Severity | Location (file:line) | Finding | Suggested fix |
|----------|----------------------|---------|---------------|

**Decision:**
- CRITICAL or HIGH → **BLOCK** — fix before `/commit-changes` continues
- Only MEDIUM/LOW → **PASS** with notes
- No findings → **PASS**

Never approve code with unresolved CRITICAL/HIGH security or correctness issues.

---

## PR Review Mode

### Phase 1 — FETCH

| Input | Action |
|---|---|
| Number (e.g. `42`) | Use as PR number |
| URL (`github.com/.../pull/42`) | Extract PR number |
| Branch name | Find PR via `gh pr list --head <branch>` |

```bash
gh pr view <NUMBER> --json number,title,body,author,baseRefName,headRefName,changedFiles,additions,deletions
gh pr diff <NUMBER>
```

### Phase 2 — REVIEW

Read changed files with surrounding context. Apply the same checklist as Local Review Mode, plus:

| Category | What to Check |
|---|---|
| **Pattern Compliance** | Matches project conventions |
| **Completeness** | Tests, docs, migrations |
| **Performance** | N+1, unbounded loops, large payloads |

### Phase 3 — DECIDE & PUBLISH

| Condition | Decision |
|---|---|
| Zero CRITICAL/HIGH | **APPROVE** (or approve with comments) |
| Any HIGH or validation failures | **REQUEST CHANGES** |
| Any CRITICAL | **BLOCK** |

If `gh` is available, post with `gh pr review`. If not, report locally only and warn.

### Phase 4 — OUTPUT

```
PR #<NUMBER>: <TITLE>
Decision: <APPROVE|REQUEST_CHANGES|BLOCK>
Issues: <critical> critical, <high> high, <medium> medium, <low> low
```

---

## Notes

- Prefer project rules in `CLAUDE.md`, `AGENTS.md`, and `.claude/rules/` when judging pattern compliance.
- For `/commit-changes`, Local Review Mode is the default and must run before creating `.claude/.commit-authorized`.
