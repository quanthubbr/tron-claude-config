#!/usr/bin/env bash
# bypass-check.sh <mode>
# mode: commit | pr
# Reads .claude/.<mode>-authorized token; if present → allow (exit 0) and remove.
# If absent → block (exit 1) with human-readable message.
#
# mode "pr" additionally validates .claude/.pr-body-draft.md structurally: it must
# contain all 5 required section headers (canonical list, keep in sync with
# managed/skills/make-pr/SKILL.md) before gh pr create is allowed to proceed.
# This is what makes the PR template mandatory rather than a convention the skill
# merely happens to follow — it's enforced regardless of which /make-pr variant
# (canonical or developer-customized) produced the body.

MODE="${1:-commit}"
TOKEN_FILE=".claude/.${MODE}-authorized"

if [ ! -f "$TOKEN_FILE" ]; then
  if [ "$MODE" = "commit" ]; then
    echo '{"decision":"block","reason":"Direct git commit blocked. Use the /commit-changes skill — it runs /code-review and /security-review automatically before committing."}' >&2
  else
    echo '{"decision":"block","reason":"Direct gh pr create blocked. Use the /make-pr skill — it builds a proper PT-BR description and validates the branch first."}' >&2
  fi
  exit 1
fi

if [ "$MODE" = "pr" ]; then
  BODY_FILE=".claude/.pr-body-draft.md"
  REQUIRED_SECTIONS=("Resumo" "Principais mudanças" "Arquitetura & implementação" "Antes → Agora" "Roteiro de teste")

  if [ ! -f "$BODY_FILE" ]; then
    echo '{"decision":"block","reason":"PR body file .claude/.pr-body-draft.md not found. The /make-pr skill must write the body there and call gh pr create --body-file (not --body inline)."}' >&2
    exit 1
  fi

  for section in "${REQUIRED_SECTIONS[@]}"; do
    # LC_ALL=C forces byte-wise matching so the U+2192 arrow in "Antes → Agora"
    # can't fail as an invalid multibyte sequence in non-UTF-8 locales (e.g. CI).
    if ! LC_ALL=C grep -q "^## ${section}" "$BODY_FILE"; then
      echo "{\"decision\":\"block\",\"reason\":\"PR body is missing required section: ## ${section}. All 5 canonical sections (Resumo, Principais mudanças, Arquitetura & implementação, Antes → Agora, Roteiro de teste) are mandatory — use the placeholder '_N/A — não aplicável a esta mudança_' under any section that genuinely doesn't apply.\"}" >&2
      exit 1
    fi
  done
fi

rm -f "$TOKEN_FILE"
exit 0
