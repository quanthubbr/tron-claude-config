---
description: Commit the current changes with semantic commits, scan for leaks, do a quick review, then push.
model: sonnet
---

Commit the current changes with semantic commits, scan for leaks, do a quick review, then push.

## Gates

exonous gates `git commit`, `git push` and `gh pr create` in every gated AI tool (`exonous doctor` lists them), machine-wide:

```
/commit-changes → /security-review → /code-review → exonous token commit → git commit   (token: one commit of the staged tree, 15 min)
force-push or push to main/master → only on the user's explicit request → exonous token push → git push
/make-pr → ≤ 30 changed files → body at `exonous draft-path` → exonous validate-pr <file> → gh pr create --body-file <file>
```

- Run each gated command **alone** (optionally after one `cd <dir> &&`): no `&&` chains, pipes, `;`, wrappers, `sh -c`, `-a`/`-i`/`-o`/`-p` or pathspecs on `git commit`.
- If the gate blocks you, read its reason, run `exonous workflow commit` (or `pr`), fix what it names, then retry. Never work around it.

Steps:
1. Run `git status --short` and `git branch --show-current`. If there is nothing to commit and nothing unpushed, say so and stop.
2. **Branch guard:** if the current branch is `main` or `master`, do NOT commit there. Create a new branch first with `git checkout -b <name>`, where `<name>` follows the established pattern `type/short-kebab-description` (type ∈ feat | fix | refactor | docs | chore | test, chosen from the dominant change). Derive the description from what actually changed.
3. **Semantic commits:** group the changes into cohesive units and commit each with a Conventional Commits message **in English** — `type: short description`, subject ≤ 100 chars, body only when the "why" isn't obvious. Prefer several small cohesive commits over one big commit.
   - Stage only the files for each unit (`git add <paths>`), never `git add -A` blindly.
   - NEVER use `git add -f`/`--force` on `.gitignore`d paths — if a file won't stage, ask the user.
4. **Authorship:** commits are authored solely by the repository's configured git identity (the current user). NEVER pass `--author`, and NEVER add `Co-Authored-By`, "Generated with", Claude, Cursor, or any AI/agent mention to the message or trailer.
5. **Leak / sensitive-data scan (before push):** use the project's available tooling to confirm nothing sensitive is going out:
   - Run the repo's secret scanner if present (e.g. `gitleaks git --staged`; the commit gate also runs it and blocks on findings or a staged `gitleaks:allow` — respect its result).
   - **Required:** invoke `/security-review` on the staged (or branch) diff. Do not skip. If it reports CRITICAL or HIGH findings, fix them before continuing — do not mint the commit token yet.
   - Verify no real `.env*` file is staged (only `*.env.example`/template files with placeholder values are allowed) and that no tokens, API keys, credentials, private certs, or PII appear in the diff.
   - If anything leaks, STOP, unstage/amend as needed, and report — do not push.
6. **Mandatory cleanup (before push):** in every modified file, remove logs and debuggers, and remove comments that don't state a relevant business rule. Comments that stay are one terse line; any comment longer than 2 lines gets cut to one (`nomos.md` § Engineering).
7. **Quick code review (before push):** **Required:** invoke `/code-review` on the staged (or branch) diff. Do not skip. Fix CRITICAL/HIGH findings before continuing; surface MEDIUM/LOW to the user. Do not mint the commit token until `/code-review` passes (no unresolved CRITICAL/HIGH).
8. **Mint the commit token:** stage the unit first, then run `exonous token commit`. It allows exactly one commit of what is staged right now and expires in 15 minutes; staging anything afterwards invalidates it. Only mint it **after** `/security-review` and `/code-review` have passed.
9. Commit with a HEREDOC message, as its own command:
   `git commit -m "$(cat <<'EOF'`
   `Commit message here.`
   `EOF`
   `)"`
   - Mint a fresh token before **each** commit in a multi-commit run (each commit consumes its token).
10. **Push:** `git push -u origin <current-branch>` needs no token. Never force-push and never push directly to `main`/`master`: the gate blocks both. Only when the user explicitly asked for one of them, run `exonous token push` right before that push (it allows one push of the current HEAD).
11. **Memory drift (warn, never block):** if `~/.claude/skills/project-memory/project-memory.mjs` exists, run `node ~/.claude/skills/project-memory/project-memory.mjs validate`; list drifted memories in the report so they get fixed.
12. Report: branch used, the commits created (hashes + subjects), leak-scan result, review summary, and push status.

Notes:
- If `$ARGUMENTS` is provided, use it as a hint for the branch name and/or commit grouping/scope.
- Follow the user's global commit conventions in `~/.claude/CLAUDE.md` ("Git and organization").
- The exonous gate enforces this flow: `git commit` without a valid token for the staged tree is blocked. This is not optional — it is the actual enforcement mechanism.
