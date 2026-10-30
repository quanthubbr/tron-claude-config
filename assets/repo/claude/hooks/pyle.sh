#!/usr/bin/env bash
# PreToolUse(Bash) gate. commit: token required. pr: template titles + max 25 files. Other commands pass.

MODE="${1:-commit}"
HOOK_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK_INPUT="$(cat)"

COMMAND="$(printf '%s' "$HOOK_INPUT" | node -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  try { process.stdout.write(String(JSON.parse(s).tool_input?.command ?? "")) } catch {}
})')"
# Empty parse → match raw JSON, so a gated command never slips through as "not ours".
COMMAND="${COMMAND:-$HOOK_INPUT}"

if [ "$MODE" = "commit" ]; then
  PATTERN='(^|[;&|[:space:]"])git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+commit([[:space:]]|$)'
else
  PATTERN='(^|[;&|[:space:]"])gh[[:space:]]+pr[[:space:]]+create([[:space:]]|$)'
fi
if ! printf '%s' "$COMMAND" | grep -Eq "$PATTERN"; then
  exit 0
fi

# Leading `cd <dir>` → command acts on that checkout (worktrees).
TARGET_DIR="."
LEADING_CD="$(printf '%s' "$COMMAND" | sed -nE 's/^[[:space:]]*cd[[:space:]]+("([^"]+)"|([^[:space:];&]+)).*/\2\3/p')"
if [ -n "$LEADING_CD" ] && [ -d "$LEADING_CD" ]; then
  TARGET_DIR="$LEADING_CD"
fi

if [ "$MODE" = "pr" ]; then
  if ! printf '%s' "$HOOK_INPUT" | (cd "$TARGET_DIR" && node "$HOOK_DIR/lib/pr-create-gate.cjs"); then
    exit 2
  fi
  exit 0
fi

# Exit 2 = deny in Claude Code; git pre-commit consumes the token after this.
ROOT="$(git -C "$TARGET_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$TARGET_DIR")"
if [ ! -f "$ROOT/.claude/.commit-authorized" ]; then
  echo "Direct git commit blocked. Use the /commit-changes skill — it runs /code-review and /security-review automatically before committing." >&2
  exit 2
fi

exit 0
