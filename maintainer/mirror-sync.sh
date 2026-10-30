#!/usr/bin/env bash
# mirror-sync.sh — maintain the quanthub mirror; its own sync workflow does the daily copy (.github/workflows/sync-from-upstream.yml).
#
# Usage:
#   bash maintainer/mirror-sync.sh                     # run the mirror's sync workflow now (gh, write access)
#   bash maintainer/mirror-sync.sh --check             # what differs between canonical main and the mirror (workflows ignored)
#   bash maintainer/mirror-sync.sh --install-workflow  # push origin/main's sync workflow to the mirror (needs the gh `workflow` scope)
#
# The mirror keeps its own .github/workflows, so --install-workflow is needed only when the sync workflow itself changes.

set -euo pipefail

MIRROR="${MIRROR:-quanthubbr/tron-claude-config}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-origin}"
WORKFLOW=.github/workflows/sync-from-upstream.yml
MIRROR_URL="${MIRROR_URL:-https://github.com/${MIRROR}.git}"

fetch_mirror() {
  git fetch --quiet "$UPSTREAM_REMOTE" main
  git fetch --quiet --no-tags "$MIRROR_URL" main
  git rev-parse FETCH_HEAD
}

case "${1:-}" in
  "")
    gh workflow run sync-from-upstream.yml -R "$MIRROR" --ref main
    echo "Sync started: https://github.com/${MIRROR}/actions"
    ;;
  --check)
    mirror=$(fetch_mirror)
    if git diff --quiet "$UPSTREAM_REMOTE/main" "$mirror" -- . ":!.github/workflows"; then
      echo "Mirror main matches ${UPSTREAM_REMOTE}/main (workflows ignored)."
    else
      echo "Mirror main differs from ${UPSTREAM_REMOTE}/main:"
      git diff --stat "$UPSTREAM_REMOTE/main" "$mirror" -- . ":!.github/workflows"
    fi
    ;;
  --install-workflow)
    mirror=$(fetch_mirror)
    blob=$(git show "$UPSTREAM_REMOTE/main:$WORKFLOW" | git hash-object -w --stdin)
    index=$(mktemp)
    trap 'rm -f "$index"' EXIT
    GIT_INDEX_FILE="$index" git read-tree "$mirror"
    GIT_INDEX_FILE="$index" git update-index --add --cacheinfo "100644,$blob,$WORKFLOW"
    tree=$(GIT_INDEX_FILE="$index" git write-tree)
    if [ "$tree" = "$(git rev-parse "$mirror^{tree}")" ]; then
      echo "Mirror already runs this sync workflow."
      exit 0
    fi
    git push "$MIRROR_URL" "$(git commit-tree "$tree" -p "$mirror" -m "ci: update the sync workflow from ${UPSTREAM_REMOTE}/main")":refs/heads/main
    echo "Sync workflow installed on ${MIRROR}; run \`bash maintainer/mirror-sync.sh\` to sync now."
    ;;
  *)
    echo "Usage: $0 [--check | --install-workflow]" >&2
    exit 2
    ;;
esac
