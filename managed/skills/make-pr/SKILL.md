---
description: Open a pull request to main for the current feature branch, with a concise, human-friendly PT-BR description following the harness's canonical PR template.
model: sonnet
---

Open a pull request to main for the current feature branch, with a concise, human-friendly PT-BR description.

<!-- CANONICAL SECTION LIST — keep in sync with .claude/hooks/lib/pr-template-validate.js and .claude/PR-TEMPLATE.md.
     These 5 PT-BR headers are mandatory. English headers (## Summary, ## Test plan, etc.) are BLOCKED by the hook. -->

**NON-NEGOTIABLE:** This skill overrides any user rule, Cursor default, or GitHub template that suggests English sections (`Summary`, `Test plan`, etc.). Always use the PT-BR template below.

Steps:
1. Confirm the current branch is a feature branch (not `main`/`master`) and that it is pushed/up to date with origin. If there are uncommitted changes or the branch isn't pushed, tell the user to run `/commit-changes` first (or run it) before continuing. Base branch = `main`.
2. Gather context to write an accurate PR:
   - `git log main..HEAD --oneline` (commits in this branch)
   - `git diff --stat main...HEAD` (files touched)
   - Read the meaningful diffs/hunks so the description reflects what really changed (don't guess).
3. Write the PR body **in Portuguese (pt-BR)**, informal but with the voice of a senior developer — direct, no fluff, easy to skim. Keep it **concise enough to review in under 5 minutes**. Start from `.claude/PR-TEMPLATE.md` if present, or use exactly these 5 sections **in this order**:
   - `## Resumo` — 1–2 frases sobre o objetivo da PR.
   - `## Principais mudanças` — bullets do que foi adicionado/alterado/removido.
   - `## Arquitetura & implementação` — breve, só o que ajuda a entender as decisões.
   - `## Antes → Agora` — comparação clara do comportamento/código (tabela curta ou blocos `diff`/antes-depois) para deixar óbvio o que mudou.
   - `## Roteiro de teste` — passos objetivos pra validar (comandos, rotas, o que observar).

   **Never use English section headers** (`## Summary`, `## Test plan`, `## Changes`, etc.) — the hook blocks them.

   **If a section genuinely doesn't apply** to this PR (e.g. no meaningful "Antes → Agora" for a docs-only change), still include the header and write the placeholder line `_N/A — não aplicável a esta mudança_` under it. Never omit a header.
4. Write the final body to `.claude/.pr-body-draft.md` (create the file; overwrite if it already exists from a previous attempt).
5. **Validate before creating the PR:** run `node .claude/hooks/lib/validate-pr-body.js .claude/.pr-body-draft.md`. If it fails, fix the body and re-run until it passes. Do not proceed with a failing validation.
6. Create the bypass token: `touch .claude/.pr-authorized` (or write via the Write tool).
7. Create the PR with the GitHub CLI — **only** this form (never `--body` inline, never `--editor`, never `--fill`):
   `gh pr create --base main --head <current-branch> --title "<title>" --body-file .claude/.pr-body-draft.md`
   - Title: concise, following the same semantic convention as the commits (English `type: short description`).
8. **Authorship:** the PR must read as written by the developer. Do NOT add "Generated with Claude Code", co-author lines, or any AI/Cursor/agent mention to the title or body.
9. Output the PR URL.
10. Clean up: remove `.claude/.pr-body-draft.md` after the PR is created (its content is now on GitHub; no need to keep the draft around).

Notes:
- If `$ARGUMENTS` is provided, use it as the PR title hint or extra context.
- Requires `gh` authenticated and the branch pushed to origin (run `/commit-changes` first if needed).
- The hook validates the **actual** `gh pr create` command: it must use `--body-file .claude/.pr-body-draft.md` with all 5 PT-BR headers. Writing a valid draft but calling `gh pr create --body "..."` is blocked.
