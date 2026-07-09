#!/usr/bin/env bash
# setup-claude-harness.sh — Install Claude enforcement harness
# Run after cloning or any package install (npm/pnpm/bun). Idempotent.
# Usage: bash scripts/setup-claude-harness.sh [--silent]

SILENT="${1:-}"
log() { [ "$SILENT" != "--silent" ] && echo "$@"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
GIT_HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_HOOKS_DIR="$REPO_ROOT/.claude/git-hooks"

# Package manager detection — used for install instructions
detect_pm() {
  if [ -f "$REPO_ROOT/bun.lockb" ] || [ -f "$REPO_ROOT/bun.lock" ]; then
    echo "bun"
  elif [ -f "$REPO_ROOT/pnpm-lock.yaml" ]; then
    echo "pnpm"
  else
    echo "npm"
  fi
}
PM=$(detect_pm)

log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log " Claude Enforcement Harness — Setup"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Install git hooks
log ""
log "📎 Installing git hooks..."
for hook in pre-commit pre-push; do
  src="$SOURCE_HOOKS_DIR/$hook"
  dst="$GIT_HOOKS_DIR/$hook"
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    chmod +x "$dst"
    log "   ✓ $hook installed"
  else
    log "   ⚠ $src not found — skipping $hook"
  fi
done

# 2. Ensure .claude directory and token files are gitignored
GITIGNORE="$REPO_ROOT/.gitignore"
for entry in ".claude/.commit-authorized" ".claude/.pr-authorized"; do
  if ! grep -qF "$entry" "$GITIGNORE" 2>/dev/null; then
    echo "$entry" >> "$GITIGNORE"
    log "   ✓ Added $entry to .gitignore"
  fi
done

# ── ECC rules ────────────────────────────────────────────────────────────────
install_ecc() {
  local ECC_TARGET="$HOME/.claude/rules/ecc"
  local ECC_FOLDERS="common typescript csharp nuxt react react-native vue web"

  if [ -d "$ECC_TARGET/common" ]; then
    log "   ✓ ECC rules already installed"
    return 0
  fi

  log ""
  log "🔌 Installing ECC rules..."
  local TMPDIR
  TMPDIR=$(mktemp -d)

  if git clone --depth=1 https://github.com/affaan-m/ECC.git "$TMPDIR/ECC" --quiet 2>/dev/null; then
    mkdir -p "$ECC_TARGET"
    for folder in $ECC_FOLDERS; do
      if [ -d "$TMPDIR/ECC/rules/$folder" ]; then
        cp -R "$TMPDIR/ECC/rules/$folder" "$ECC_TARGET/"
        log "   ✓ ECC rules/$folder"
      fi
    done
    log "   ✅ ECC installed → $ECC_TARGET"
  else
    log "   ⚠ ECC install failed (check internet connection)"
  fi

  rm -rf "$TMPDIR"
}

install_ecc

# 3. Check required tools
log ""
log "🔍 Checking required tools..."

MISSING=()

if command -v rtk &>/dev/null; then
  log "   ✓ rtk $(rtk --version 2>/dev/null || echo '(version unknown)')"
else
  log "   ✗ rtk — MISSING"
  MISSING+=("rtk")
fi

if npx gsd-core --version &>/dev/null 2>&1 || command -v gsd &>/dev/null; then
  log "   ✓ gsd"
else
  log "   ✗ gsd — MISSING"
  MISSING+=("gsd")
fi

if node -e "
  const fs = require('fs');
  const p = process.env.HOME + '/.claude/.mcp.json';
  if (!fs.existsSync(p)) process.exit(1);
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Object.keys(d.mcpServers||{}).some(k=>k.includes('codebase-memory'))) process.exit(1);
" 2>/dev/null; then
  log "   ✓ codebase-memory-mcp"
else
  log "   ✗ codebase-memory-mcp — NOT REGISTERED in ~/.claude/.mcp.json"
  MISSING+=("codebase-memory-mcp")
fi

# 4. Print install instructions for missing tools
if [ ${#MISSING[@]} -gt 0 ]; then
  log ""
  log "⚠️  Missing tools. Install instructions:"
  for tool in "${MISSING[@]}"; do
    case "$tool" in
      rtk)
        log "   rtk:  cargo install rtk"
        log "         (or see ~/.claude/RTK.md)"
        ;;
      gsd)
        case "$PM" in
          bun)  log "   gsd:  bun add -g gsd-core" ;;
          pnpm) log "   gsd:  pnpm add -g gsd-core" ;;
          *)    log "   gsd:  npm install -g gsd-core" ;;
        esac
        ;;
      codebase-memory-mcp)
        log "   codebase-memory-mcp: see ~/.claude/skills/codebase-memory/SKILL.md"
        log "         (register the MCP server in Claude Code settings)"
        ;;
    esac
  done
  log ""
  log "Re-run this script after installing missing tools."
  exit 1
fi

log ""
log "✅ Harness installed successfully."
log ""
exit 0
