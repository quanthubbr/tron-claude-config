---
description: Open a pull request to main for the current feature branch, with a concise, human-friendly PT-BR description following the harness's canonical PR template.
model: sonnet
---

Open a pull request to main for the current feature branch, with a concise, human-friendly PT-BR description.

<!-- CANONICAL SECTION LIST — keep in sync with .claude/hooks/bypass-check.sh (grep list in the `pr` mode).
     These 5 headers are the enforcement contract: bypass-check.sh blocks `gh pr create` if any is missing
     from the body file. Do not rename/reorder without updating the hook in the same change. -->

Steps:
1. Confirm the current branch is a feature branch (not `main`/`master`) and that it is pushed/up to date with origin. If there are uncommitted changes or the branch isn't pushed, tell the user to run `/commit-changes` first (or run it) before continuing. Base branch = `main`.
2. Gather context to write an accurate PR:
   - `git log main..HEAD --oneline` (commits in this branch)
   - `git diff --stat main...HEAD` (files touched)
   - Read the meaningful diffs/hunks so the description reflects what really changed (don't guess).
3. Write the PR body **in Portuguese (pt-BR)**, informal but with the voice of a senior developer — direct, no fluff, easy to skim. Keep it **concise enough to review in under 5 minutes**. Use exactly these 5 sections, in this order:
   - `## Resumo` — 1–2 frases sobre o objetivo da PR.
   - `## Principais mudanças` — bullets do que foi adicionado/alterado/removido.
   - `## Arquitetura & implementação` — breve, só o que ajuda a entender as decisões.
   - `## Antes → Agora` — comparação clara do comportamento/código (tabela curta ou blocos `diff`/antes-depois) para deixar óbvio o que mudou.
   - `## Roteiro de teste` — passos objetivos pra validar (comandos, rotas, o que observar).

   **If a section genuinely doesn't apply** to this PR (e.g. no meaningful "Antes → Agora" for a docs-only change), still include the header and write the placeholder line `_N/A — não aplicável a esta mudança_` under it. Never omit a header — the enforcement hook checks for header presence, not content quality, and a missing header blocks the PR.
4. **Self-validate before creating the PR:** re-read the assembled body and confirm all 5 `##` headers above are present, in order. If any is missing, add it (with the placeholder if not applicable) before proceeding — do not call `gh pr create` with an incomplete body.
5. Write the final body to `.claude/.pr-body-draft.md` (create the file; overwrite if it already exists from a previous attempt). Do not pass the body inline via `--body` — always use `--body-file`, since inline shell strings with multiline/quoted content are fragile to parse and the enforcement hook expects to read this file.
6. Create the bypass token: `touch .claude/.pr-authorized` (or write via the Write tool).
7. Create the PR with the GitHub CLI:
   `gh pr create --base main --head <current-branch> --title "<title>" --body-file .claude/.pr-body-draft.md`
   - Title: concise, following the same semantic convention as the commits (English `type: short description`).
8. **Authorship:** the PR must read as written by the developer. Do NOT add "Generated with Claude Code", co-author lines, or any AI/Cursor/agent mention to the title or body.
9. Output the PR URL.
10. Clean up: remove `.claude/.pr-body-draft.md` after the PR is created (its content is now on GitHub; no need to keep the draft around).

Notes:
- If `$ARGUMENTS` is provided, use it as the PR title hint or extra context.
- Requires `gh` authenticated and the branch pushed to origin (run `/commit-changes` first if needed).
- The `.claude/hooks/bypass-check.sh pr` hook enforces this: it blocks `gh pr create` unless `.claude/.pr-authorized` is present AND `.claude/.pr-body-draft.md` contains all 5 required section headers. This is not optional — it is the actual enforcement mechanism, not a convention this skill merely follows voluntarily.
