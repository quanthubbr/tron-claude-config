#!/usr/bin/env bash
# E2E smoke: pack → temp-prefix global install → wire tools in a temp home → gate a commit → uninstall; all under one trapped temp dir.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REAL_HOME="$HOME"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/exonous-e2e-XXXXXX")"
cleanup() {
  case "$WORK" in
    */exonous-e2e-*) rm -rf "$WORK" ;;
  esac
}
trap cleanup EXIT

PREFIX="$WORK/prefix"
# Two temp dirs: EXONOUS_HOME differs from the OS home, so install skips the networked steps (atlas download, claude CLI).
export HOME="$WORK/oshome"
export EXONOUS_HOME="$WORK/home"
export EXONOUS_NO_UPDATE=1
export GIT_CONFIG_GLOBAL=/dev/null
export GIT_CONFIG_NOSYSTEM=1
export npm_config_cache="$WORK/npm-cache"
export npm_config_update_notifier=false
NODE_DIR="$(dirname "$(command -v node)")"
export PATH="$PREFIX/bin:$NODE_DIR:/usr/bin:/bin"
unset XDG_CONFIG_HOME COPILOT_HOME EXONOUS_TEST EXONOUS_RELEASE_SOURCE EXONOUS_UPDATE_TEST_PM CI npm_config_prefix || true

# Guard: both homes must be the temp dirs created above, never the real one.
for dir in "$HOME" "$EXONOUS_HOME"; do
  case "$dir" in
    "$WORK"/*) ;;
    *) echo "ABORT: $dir is not under $WORK"; exit 2 ;;
  esac
  [ "$dir" != "$REAL_HOME" ] || { echo "ABORT: refusing to use the real home"; exit 2; }
done
[ "$HOME" != "$EXONOUS_HOME" ] || { echo "ABORT: HOME and EXONOUS_HOME must differ"; exit 2; }
mkdir -p "$HOME" "$EXONOUS_HOME" "$PREFIX"

FAILS=0
step() {
  local name="$1"
  shift
  if "$@" >"$WORK/step.log" 2>&1; then
    echo "PASS  $name"
  else
    echo "FAIL  $name"
    sed 's/^/      /' "$WORK/step.log" | tail -n 15
    FAILS=$((FAILS + 1))
  fi
}
skip() { echo "SKIP  $1"; }

# Foreign content in every tool's config; it must survive install and uninstall byte for byte.
seed() {
  mkdir -p "$EXONOUS_HOME/.claude" "$EXONOUS_HOME/.cursor" "$EXONOUS_HOME/.gemini" "$EXONOUS_HOME/.config/opencode" "$EXONOUS_HOME/.copilot/hooks"
  printf '{\n  "hooks": {\n    "Stop": [\n      {\n        "hooks": [\n          {\n            "type": "command",\n            "command": "say done"\n          }\n        ]\n      }\n    ]\n  }\n}\n' >"$EXONOUS_HOME/.claude/settings.json"
  printf '{\n  "version": 1,\n  "hooks": {\n    "afterFileEdit": [\n      {\n        "command": "fmt"\n      }\n    ]\n  }\n}\n' >"$EXONOUS_HOME/.cursor/hooks.json"
  printf '{\n  "theme": "dark"\n}\n' >"$EXONOUS_HOME/.gemini/settings.json"
  printf '# my gemini notes\n' >"$EXONOUS_HOME/.gemini/GEMINI.md"
  printf '{\n  "theme": "tokyonight"\n}\n' >"$EXONOUS_HOME/.config/opencode/opencode.json"
  printf '{"version":1,"hooks":{"postToolUse":[{"type":"command","command":"log.sh"}]}}\n' >"$EXONOUS_HOME/.copilot/hooks/mine.json"
  mkdir -p "$WORK/seed"
  for f in .claude/settings.json .cursor/hooks.json .gemini/settings.json .gemini/GEMINI.md .config/opencode/opencode.json .copilot/hooks/mine.json; do
    mkdir -p "$WORK/seed/$(dirname "$f")"
    cp "$EXONOUS_HOME/$f" "$WORK/seed/$f"
  done
}

pack() {
  (cd "$ROOT" && npm pack --silent --pack-destination "$WORK") >"$WORK/pack.name"
  TARBALL="$WORK/$(tail -n 1 "$WORK/pack.name")"
  [ -f "$TARBALL" ]
}

# No install lifecycle scripts: npm must install the tarball without running any exonous code.
global_install() {
  npm i -g --prefix "$PREFIX" --offline --no-audit --no-fund --foreground-scripts "$TARBALL" >"$WORK/npm-install.out" 2>&1
  cat "$WORK/npm-install.out"
  ! grep -q '\[exonous\]' "$WORK/npm-install.out"
  [ ! -e "$EXONOUS_HOME/.claude/exonous" ]
  command -v exonous | grep -q "^$PREFIX/"
}

doctor() {
  exonous doctor >"$WORK/doctor.out" 2>&1 || true
  cat "$WORK/doctor.out"
  grep -q 'Tool .*| Tier .*| Rules .*| Gate' "$WORK/doctor.out"
}

claude_gate() {
  node -e '
    const s = require(process.argv[1]);
    const e = (s.hooks.PreToolUse || []).find((x) => JSON.stringify(x).includes("pyle.cjs"));
    process.stdout.write(e.hooks[0].command);
  ' "$EXONOUS_HOME/.claude/settings.json"
}

repo_setup() {
  REPO="$WORK/repo"
  mkdir -p "$REPO"
  git -C "$REPO" init -q
  echo smoke >"$REPO/a.txt"
  git -C "$REPO" add a.txt
}

commit_through_hook() {
  local cmd payload
  cmd="$(claude_gate)"
  payload="{\"hook_event_name\":\"PreToolUse\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git commit -m smoke\"},\"cwd\":\"$REPO\"}"
  printf '%s' "$payload" | sh -c "$cmd"
}

denied_without_token() {
  set +e
  commit_through_hook
  local code=$?
  set -e
  [ "$code" -eq 2 ]
}

allowed_with_token() {
  (cd "$REPO" && exonous token commit)
  commit_through_hook
}

no_owned_entries() {
  [ ! -e "$EXONOUS_HOME/.claude/exonous/installed.json" ]
  ! grep -rl '/.claude/exonous/hooks/' "$EXONOUS_HOME/.claude/settings.json" "$EXONOUS_HOME/.cursor/hooks.json" "$EXONOUS_HOME/.gemini/settings.json" \
    "$EXONOUS_HOME/.config/opencode" "$EXONOUS_HOME/.copilot/hooks" 2>/dev/null
}

foreign_intact() {
  for f in .claude/settings.json .cursor/hooks.json .gemini/settings.json .gemini/GEMINI.md .config/opencode/opencode.json .copilot/hooks/mine.json; do
    cmp -s "$WORK/seed/$f" "$EXONOUS_HOME/$f" || { echo "changed: ~/$f"; diff "$WORK/seed/$f" "$EXONOUS_HOME/$f" || true; return 1; }
  done
}

echo "exonous e2e smoke — work dir $WORK"
oshome_untouched() { [ -z "$(ls -A "$HOME" | grep -v '^\.npm$' || true)" ]; }
seed
step "npm pack" pack
step "global install into a temp prefix runs none of our code" global_install
step "exonous install" exonous install --quiet
step "exonous doctor renders the coverage matrix" doctor
sed -n '/Tool .*| Tier/,/^$/p' "$WORK/doctor.out"
for tool in claude cursor gemini opencode copilot; do
  if grep -Eq "^  $tool +\\| [^|]+\\| [^|]*\\| not installed" "$WORK/doctor.out"; then
    skip "gate --selftest $tool: $tool not detected"
  else
    step "gate --selftest $tool" exonous gate --selftest "$tool"
  fi
done
step "throwaway repo with a staged change" repo_setup
step "git commit through the Claude hook is denied without a token" denied_without_token
step "git commit through the Claude hook is allowed after exonous token commit" allowed_with_token
step "exonous uninstall --yes" exonous uninstall --yes
step "no owned entries remain (ledger gone, no exonous hooks in any tool config)" no_owned_entries
step "foreign seed content is byte-identical" foreign_intact
step "the OS home got nothing from exonous" oshome_untouched

if [ "$FAILS" -eq 0 ]; then
  echo "SMOKE PASS"
else
  echo "SMOKE FAIL ($FAILS step(s))"
  exit 1
fi
