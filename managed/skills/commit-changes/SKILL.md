---
description: Commit the current changes with semantic commits, scan for leaks, do a quick review, then push.
model: sonnet
---

Commit the current changes with semantic commits, scan for leaks, do a quick review, then push.

<!-- CANONICAL COMMIT FLOW — keep in sync with .claude/hooks/bypass-check.sh (mode: commit)
     and .git/hooks/pre-commit. The bypass token `.claude/.commit-authorized` is the only
     path through both hooks. Create it immediately before `git commit`; the Claude Code
     PreToolUse hook (bypass-check.sh) deletes it after allowing the commit through. -->

Steps:
1. Run `git status --short` and `git branch --show-current`. If there is nothing to commit and nothing unpushed, say so and stop.
2. **Branch guard:** if the current branch is `main` or `master`, do NOT commit there. Create a new branch first with `git checkout -b <name>`, where `<name>` follows the established pattern `type/short-kebab-description` (type ∈ feat | fix | refactor | docs | chore | test, chosen from the dominant change). Derive the description from what actually changed.
3. **Semantic commits:** group the changes into cohesive units and commit each with a Conventional Commits message **in English** — `type: short description`, subject ≤ 100 chars, body only when the "why" isn't obvious. Prefer several small cohesive commits over one big commit.
   - Stage only the files for each unit (`git add <paths>`), never `git add -A` blindly.
   - NEVER use `git add -f`/`--force` on `.gitignore`d paths — if a file won't stage, ask the user.
   - **GSD / `.planning/` files are committed LAST and ALONE:** keep all `.planning/` changes out of the feature-work commits, bundle them into a single final `docs:` commit (e.g. `docs: update GSD planning artifacts`) on the current branch, created only after every real-work commit. If the only pending changes are `.planning/` files, that one `docs:` commit is the whole job.
4. **Authorship:** commits are authored solely by the repository's configured git identity (the current user). NEVER pass `--author`, and NEVER add `Co-Authored-By`, "Generated with", Claude, Cursor, or any AI/agent mention to the message or trailer.
5. **Leak / sensitive-data scan (before push):** use the project's available tooling to confirm nothing sensitive is going out:
   - Run the repo's secret scanner if present (e.g. `gitleaks git --staged` or `gitleaks detect --staged`; it also runs on the commit hook — respect its result).
   - **Required:** invoke `/security-review` on the staged (or branch) diff. Do not skip. If it reports CRITICAL or HIGH findings, fix them before continuing — do not create the bypass token yet.
   - Verify no real `.env*` file is staged (only `*.env.example`/template files with placeholder values are allowed) and that no tokens, API keys, credentials, private certs, or PII appear in the diff.
   - If anything leaks, STOP, unstage/amend as needed, and report — do not push.
6. **Mandatory cleanup (before push):** Remove all comments, logs and debuggers from all modified files before pushing.
7. **Quick code review (before push):** **Required:** invoke `/code-review` on the staged (or branch) diff. Do not skip. Fix CRITICAL/HIGH findings before continuing; surface MEDIUM/LOW to the user. Do not create the bypass token until `/code-review` passes (no unresolved CRITICAL/HIGH).
8. **Create the bypass token before each commit:** `touch .claude/.commit-authorized` (or write via the Write tool). Without this file, both the Claude Code PreToolUse hook and the git `pre-commit` hook block `git commit`. Only create this token **after** `/security-review` and `/code-review` have passed.
9. Commit with a HEREDOC message:
   `git commit -m "$(cat <<'EOF'`
   `Commit message here.`
   `EOF`
   `)"`
   - Create a fresh `.claude/.commit-authorized` before **each** commit in a multi-commit run (the hook deletes the token after allowing one commit through).
10. **Push:** create the bypass token again if needed for push (`touch .claude/.commit-authorized` — the `pre-push` hook accepts either commit or PR token), then `git push -u origin <current-branch>`. Never force-push and never push directly to `main`/`master`.
11. Report: branch used, the commits created (hashes + subjects), leak-scan result, review summary, and push status.

Notes:
- If `$ARGUMENTS` is provided, use it as a hint for the branch name and/or commit grouping/scope.
- Follow the user's global commit conventions in `~/.claude/CLAUDE.md` ("Git and organization").
- The `.claude/hooks/bypass-check.sh commit` hook enforces this: it blocks `git commit` unless `.claude/.commit-authorized` is present. This is not optional — it is the actual enforcement mechanism.
