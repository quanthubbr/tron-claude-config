#!/usr/bin/env bash
# sync-quanthub-fork.sh — mirror canonical repo → quanthubbr/tron-claude-config (push)
#
# quanthubbr/tron-claude-config is an org mirror, NOT a GitHub fork — no upstream PR UI.
# Prefer automatic pull on the mirror: .github/workflows/sync-from-upstream.yml
# (runs only on quanthubbr/tron-claude-config).
#
# This push script is for maintainers who have git push access to the mirror.
#
# Usage:
#   bash scripts/sync-quanthub-fork.sh              # push origin/main → quanthub/main (+ tags)
#   bash scripts/sync-quanthub-fork.sh --check      # dry-run: show ahead/behind only
#   bash scripts/sync-quanthub-fork.sh --pull       # merge quanthub-only commits into local main
#
# Env overrides:
#   UPSTREAM_REMOTE=origin   canonical remote (default: origin)
#   FORK_REMOTE=quanthub     mirror remote name (default: quanthub)
#   FORK_URL=https://github.com/quanthubbr/tron-claude-config.git
#   BRANCH=main

set -euo pipefail

UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-origin}"
FORK_REMOTE="${FORK_REMOTE:-quanthub}"
FORK_URL="${FORK_URL:-https://github.com/quanthubbr/tron-claude-config.git}"
BRANCH="${BRANCH:-main}"

MODE="${1:-push}"

ensure_fork_remote() {
  if git remote get-url "$FORK_REMOTE" &>/dev/null 2>&1; then
    return 0
  fi
  echo "Adding remote ${FORK_REMOTE} → ${FORK_URL}"
  git remote add "$FORK_REMOTE" "$FORK_URL"
}

fetch_both() {
  git fetch "$UPSTREAM_REMOTE" "$BRANCH"
  if git remote get-url "$FORK_REMOTE" &>/dev/null 2>&1; then
    git fetch "$FORK_REMOTE" "$BRANCH" 2>/dev/null || true
  fi
}

upstream_ref() {
  echo "${UPSTREAM_REMOTE}/${BRANCH}"
}

fork_ref() {
  echo "${FORK_REMOTE}/${BRANCH}"
}

report_status() {
  local up fork
  up=$(git rev-parse "$(upstream_ref)")
  fork=""
  if git show-ref --verify --quiet "refs/remotes/$(fork_ref)" 2>/dev/null; then
    fork=$(git rev-parse "$(fork_ref)")
  fi

  echo "Canonical ($(upstream_ref)): ${up}"
  if [ -n "$fork" ]; then
    echo "Mirror   ($(fork_ref)):   ${fork}"
    local ahead behind
    ahead=$(git rev-list --count "${fork}..${up}" 2>/dev/null || echo 0)
    behind=$(git rev-list --count "${up}..${fork}" 2>/dev/null || echo 0)
    echo "Mirror is ${behind} behind, ${ahead} ahead of canonical."
    if [ "$behind" -gt 0 ]; then
      echo ""
      echo "Commits on mirror not in canonical:"
      git log "${up}..${fork}" --oneline
    fi
  else
    echo "Mirror: (no ${BRANCH} on ${FORK_REMOTE} yet)"
  fi
}

push_to_mirror() {
  ensure_fork_remote
  fetch_both

  local up fork
  up=$(git rev-parse "$(upstream_ref)")
  fork=""
  if git show-ref --verify --quiet "refs/remotes/$(fork_ref)" 2>/dev/null; then
    fork=$(git rev-parse "$(fork_ref)")
  fi

  if [ -n "$fork" ] && [ "$up" = "$fork" ]; then
    echo "Already in sync — nothing to push."
    return 0
  fi

  if [ -n "$fork" ] && ! git merge-base --is-ancestor "$fork" "$up" 2>/dev/null; then
    echo "ERROR: histories diverged. Mirror has commits not in canonical." >&2
    report_status
    echo "" >&2
    echo "Resolve manually (cherry-pick to canonical, or reset mirror after review):" >&2
    echo "  git log ${up}..${fork} --oneline" >&2
    exit 1
  fi

  echo "Pushing $(upstream_ref) → ${FORK_REMOTE}/${BRANCH}"
  git push "$FORK_REMOTE" "$(upstream_ref):refs/heads/${BRANCH}"
  echo "Pushing tags → ${FORK_REMOTE}"
  git push "$FORK_REMOTE" --tags
  echo "Done. Mirror updated: https://github.com/quanthubbr/tron-claude-config"
}

pull_from_mirror() {
  ensure_fork_remote
  fetch_both

  if ! git show-ref --verify --quiet "refs/remotes/$(fork_ref)" 2>/dev/null; then
    echo "Nothing to pull — mirror has no ${BRANCH} branch."
    exit 0
  fi

  local up fork behind
  up=$(git rev-parse "$(upstream_ref)")
  fork=$(git rev-parse "$(fork_ref)")
  behind=$(git rev-list --count "${up}..${fork}" 2>/dev/null || echo 0)

  if [ "$behind" -eq 0 ]; then
    echo "Mirror has no commits ahead of canonical — nothing to pull."
    exit 0
  fi

  echo "Mirror is ${behind} commit(s) ahead of canonical. Merging into local ${BRANCH}..."
  git checkout "$BRANCH"
  git merge "$(fork_ref)" -m "chore: merge quanthub mirror-only commits into main"
  echo "Merged. Push to canonical when ready: git push ${UPSTREAM_REMOTE} ${BRANCH}"
}

case "$MODE" in
  --check|-n)
    ensure_fork_remote
    fetch_both
    report_status
    ;;
  --pull)
    pull_from_mirror
    ;;
  push|--push|"")
    push_to_mirror
    ;;
  *)
    echo "Unknown mode: $MODE" >&2
    echo "Usage: $0 [--check | --pull]" >&2
    exit 2
    ;;
esac
