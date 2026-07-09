#!/usr/bin/env bash
# bypass-check.sh <mode>
# mode: commit | pr
# Reads .claude/.<mode>-authorized token; if present → allow (exit 0) and remove.
# If absent → block (exit 1) with human-readable message.

MODE="${1:-commit}"
TOKEN_FILE=".claude/.${MODE}-authorized"

if [ -f "$TOKEN_FILE" ]; then
  rm -f "$TOKEN_FILE"
  exit 0
fi

if [ "$MODE" = "commit" ]; then
  echo '{"decision":"block","reason":"Direct git commit blocked. Use the /commit-changes skill — it runs /code-review and /security-review automatically before committing."}' >&2
else
  echo '{"decision":"block","reason":"Direct gh pr create blocked. Use the /make-pr skill — it builds a proper PT-BR description and validates the branch first."}' >&2
fi
exit 1
