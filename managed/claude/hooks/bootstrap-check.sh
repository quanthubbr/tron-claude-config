#!/usr/bin/env bash
# bootstrap-check.sh — UserPromptSubmit hook
# Runs on every Claude Code prompt. Two jobs:
#   1. Auto-update the harness (once per 24h, silent)
#   2. Verify required tools are installed; inject install instructions if missing
# Always exits 0 (never blocks the user's prompt).
# Output on stdout is injected into Claude's context as a system note.

LAST_CHECK_FILE=".claude/.harness-last-update"
NOW=$(date +%s)

# ── Package manager detection (pm-agnostic) ──────────────────────────────────
detect_pm() {
  if [ -f "bun.lockb" ] || [ -f "bun.lock" ]; then
    echo "bun"
  elif [ -f "pnpm-lock.yaml" ]; then
    echo "pnpm"
  else
    echo "npm"
  fi
}

PM=$(detect_pm)

# ── Auto-update (debounced to once per 24h) ─────────────────────────────────
SHOULD_UPDATE=true
if [ -f "$LAST_CHECK_FILE" ]; then
  LAST=$(cat "$LAST_CHECK_FILE" 2>/dev/null || echo 0)
  if [ $((NOW - LAST)) -lt 86400 ]; then
    SHOULD_UPDATE=false
  fi
fi

if [ "$SHOULD_UPDATE" = true ]; then
  # Write timestamp immediately (prevents concurrent update races)
  echo "$NOW" > "$LAST_CHECK_FILE"

  PACKAGE_NAME="@tron/claude-config"
  PKG_JSON="node_modules/${PACKAGE_NAME}/package.json"

  if [ -f "$PKG_JSON" ]; then
    INSTALLED_VERSION=$(node -e "
      try { process.stdout.write(require('./${PKG_JSON}').version || ''); }
      catch(e) { process.stdout.write(''); }
    " 2>/dev/null)

    # For git-sourced packages: compare resolved commit vs remote HEAD
    INSTALLED_SHA=$(node -e "
      try {
        const r = require('./${PKG_JSON}')._resolved || '';
        process.stdout.write(r.split('#')[1] || '');
      } catch(e) { process.stdout.write(''); }
    " 2>/dev/null)

    REMOTE_SHA=""
    if [ -d "node_modules/${PACKAGE_NAME}/.git" ]; then
      REMOTE_SHA=$(git -C "node_modules/${PACKAGE_NAME}" ls-remote origin HEAD 2>/dev/null | awk '{print $1}')
    fi

    NEEDS_UPDATE=false
    if [ -n "$REMOTE_SHA" ] && [ -n "$INSTALLED_SHA" ] && [ "$INSTALLED_SHA" != "$REMOTE_SHA" ]; then
      NEEDS_UPDATE=true
    fi

    if [ "$NEEDS_UPDATE" = true ]; then
      echo "[harness] update available ($INSTALLED_VERSION → latest), applying..."
      # Use detected package manager — never hardcode npm
      case "$PM" in
        bun)  bun add --dev "${PACKAGE_NAME}" 2>/dev/null ;;
        pnpm) pnpm add --save-dev "${PACKAGE_NAME}" --silent 2>/dev/null ;;
        *)    npm install --save-dev "${PACKAGE_NAME}" --silent 2>/dev/null ;;
      esac
      bash scripts/setup-claude-harness.sh --silent 2>/dev/null
      echo "[harness] updated ✓"
    fi
  fi
fi

# ── Tool verification ─────────────────────────────────────────────────────────
MISSING=()

# Check rtk
if ! command -v rtk &>/dev/null; then
  MISSING+=("rtk")
fi

# Check gsd
if ! npx --yes gsd-core --version &>/dev/null 2>&1 && ! command -v gsd &>/dev/null; then
  MISSING+=("gsd")
fi

# Check codebase-memory-mcp (check if the MCP server is registered)
if ! node -e "
  const fs = require('fs');
  const p = process.env.HOME + '/.claude/.mcp.json';
  if (!fs.existsSync(p)) process.exit(1);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  const keys = Object.keys(d.mcpServers || {});
  if (!keys.some(k => k.includes('codebase-memory'))) process.exit(1);
" 2>/dev/null; then
  MISSING+=("codebase-memory-mcp")
fi

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️  CLAUDE HARNESS: Missing required tools: ${MISSING[*]}"
  echo "Run: bash scripts/setup-claude-harness.sh"
  echo "Or install individually:"
  for tool in "${MISSING[@]}"; do
    case "$tool" in
      rtk)
        echo "  rtk: cargo install rtk  (see ~/.claude/RTK.md)"
        ;;
      gsd)
        echo "  gsd: npm install -g gsd-core"
        ;;
      codebase-memory-mcp)
        echo "  codebase-memory-mcp: see ~/.claude/skills/codebase-memory/SKILL.md"
        ;;
    esac
  done
fi

exit 0
