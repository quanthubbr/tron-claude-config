# Git workflow

## Branching

| Model | When |
|-------|------|
| **GitHub Flow** | Default — `main` protected; `feature/*`, `fix/*`, `hotfix/*` → PR → merge |
| **Trunk-based** | Strong CI + feature flags; branches live ≤1–2 days |
| **GitFlow** | Scheduled releases — `develop` integration, `release/*`, hotfixes from `main` |

Naming: `feature/short-description`, `fix/issue-slug`, optional ticket prefix `PROJ-123-slug`. Delete merged branches locally (`git branch -d`) and prune remotes (`git fetch -p`).

## Commits

Format: `type(scope): imperative subject` (≤50 chars subject). Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `revert`. Body explains **why**; footer links issues (`Closes #n`) without co-author trailers.

Optional repo template: `.gitmessage` + `git config commit.template .gitmessage`.

## Merge vs rebase

- **Merge into `main`**: preserves branch history; default for integrated PRs.
- **Rebase feature onto `main`**: linear history before PR; only if branch is yours and not shared.
- **Never rebase** public/shared branches others built on.

Update before PR:

```bash
git fetch origin
git rebase origin/main   # or merge origin/main
# resolve conflicts, rerun tests
git push --force-with-lease origin feature/my-branch   # solo branch only
```

## Pull requests

Title mirrors commit convention. Description: what / why / how / testing checklist. Keep diffs reviewable (≈500 lines ideal, single concern). Self-review and green CI before requesting review.

## Conflicts

```bash
git status                    # conflicted paths
# edit files: remove <<<<<<< ======= >>>>>>> markers
git add <paths>
git commit                    # or continue rebase: git rebase --continue
```

Prevention: small branches, frequent sync with `main`, communicate on shared hotspots.

## Releases (git layer)

Semver tags: `vMAJOR.MINOR.PATCH`. Annotated tags carry release notes; push tags explicitly. Changelog from conventional commits or `gh release create --generate-notes` (see github-ops ref).

## Recovery (local)

| Goal | Command |
|------|---------|
| Undo commit, keep changes | `git reset --soft HEAD~1` |
| Undo commit on pushed shared branch | `git revert <sha>` |
| Discard file changes | `git restore -- path` |
| Stash WIP | `git stash push -m "msg"` / `git stash pop` |

## Anti-patterns

Direct commits to `main`; secrets in history; `git push --force` on shared refs; week-long divergent branches; committing `node_modules`, `.env`, or build artifacts.
