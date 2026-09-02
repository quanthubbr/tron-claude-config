#!/usr/bin/env bash
# bypass-check.sh <mode>
# mode: commit | pr
# Reads .claude/.<mode>-authorized token; if present → allow (exit 0) and remove.
# If absent → block (exit 1) with human-readable message.
#
# mode "pr" additionally validates the *actual* gh pr create command (stdin JSON)
# and the body file it references — not just token presence. Blocks inline --body,
# wrong --body-file paths, English headers (## Summary), and missing PT-BR sections.
# Keep in sync with managed/skills/make-pr/SKILL.md and hooks/lib/pr-template-validate.js.

MODE="${1:-commit}"
TOKEN_FILE=".claude/.${MODE}-authorized"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f "$TOKEN_FILE" ]; then
  if [ "$MODE" = "commit" ]; then
    echo '{"decision":"block","reason":"Direct git commit blocked. Use the /commit-changes skill — it runs /code-review and /security-review automatically before committing."}' >&2
  else
    echo '{"decision":"block","reason":"Direct gh pr create blocked. Use the /make-pr skill — it builds a proper PT-BR description and validates the branch first."}' >&2
  fi
  exit 1
fi

if [ "$MODE" = "pr" ]; then
  HOOK_INPUT="$(cat)"
  if ! echo "$HOOK_INPUT" | node "$HOOK_DIR/lib/pr-create-gate.js"; then
    exit 1
  fi
fi

rm -f "$TOKEN_FILE"
exit 0
