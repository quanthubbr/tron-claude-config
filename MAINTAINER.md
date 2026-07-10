# tron-claude-config — Maintainer Guide

This doc is for whoever owns the `tron-claude-config` package — the source of truth for the Claude enforcement harness shared across all company repos.

---

## What this package does

`tron-claude-config` distributes a standardized Claude Code enforcement harness to all consumer repos via `npm install`. When a developer (or `npm install`) runs in a consumer repo, the package:

1. Copies managed hook files to `.claude/hooks/`
2. Copies `.claude/settings.json` (Claude Code hooks)
3. Installs native git hooks (`.git/hooks/pre-commit`, `.git/hooks/pre-push`)
4. On every Claude Code session start: silently checks for updates and self-updates if outdated

Non-technical users get this without doing anything. Technical users get it on `npm install`.

---

## File structure

```
tron-claude-config/
├── package.json                    # name, version (semver), scripts
├── scripts/
│   └── postinstall.js             # runs on npm install — copies managed files, installs git hooks
├── managed/
│   ├── claude/
│   │   ├── settings.json          # Claude Code hooks (bypass-check, bootstrap, auto-update)
│   │   └── hooks/
│   │       ├── bypass-check.sh    # bypass token for commit/pr skills + PR-body template validation
│   │       └── bootstrap-check.sh # tool verification + auto-update (UserPromptSubmit hook)
│   ├── git-hooks/
│   │   ├── pre-commit             # blocks direct terminal git commit
│   │   └── pre-push               # blocks direct terminal git push to main
│   └── skills/
│       ├── commit-changes/
│       │   └── SKILL.md           # canonical /commit-changes skill — installed to ~/.claude/commands/, install-if-missing
│       └── make-pr/
│           └── SKILL.md           # canonical /make-pr skill — installed to ~/.claude/commands/, install-if-missing
├── MAINTAINER.md                  # this file
└── README.md                      # consumer-facing setup instructions
```

### Managed vs user-owned files

| File | Owner | Notes |
|------|-------|-------|
| `.claude/settings.json` | **Package (overwritten on update)** | Do not edit manually in consumer repos |
| `.claude/hooks/bypass-check.sh` | **Package** | Do not edit in consumer repos |
| `.claude/hooks/bootstrap-check.sh` | **Package** | Do not edit in consumer repos |
| `.git/hooks/pre-commit` | **Package** | Installed/overwritten by setup |
| `.git/hooks/pre-push` | **Package** | Installed/overwritten by setup |
| `~/.claude/commands/commit-changes.md` | **Package (install-if-missing, global)** | Installed once per machine, never overwrites an existing customized `/commit-changes`. Creates `.claude/.commit-authorized` before commits. |
| `~/.claude/commands/make-pr.md` | **Package (install-if-missing, global)** | Installed once per machine, never overwrites an existing customized `/make-pr`. Enforcement of the PR template happens in the hook regardless of which version is present. |
| `.claude/.pr-body-draft.md` | **Ephemeral (repo, gitignored)** | Written by `/make-pr` per PR, read by `bypass-check.sh` for template validation, deleted after `gh pr create` succeeds |
| `.claude/commands/*.md` (repo-local, other than `make-pr.md`) | **Repo** | Skills — repo-specific, never overwritten |
| `CLAUDE.md` | **Repo** | Project rules — never overwritten |
| `.claude/settings.local.json` | **Repo** | Local overrides — never touched |

The `postinstall.js` script only writes files in the "Package" rows above. It never touches repo-owned files.

---

## Releasing a new version

```bash
# 1. Make your changes to files under managed/
# 2. Bump the version (semver: patch for fixes, minor for new features)
npm version patch   # or: npm version minor | npm version major

# 3. Commit and push
git add -A
git commit -m "chore: bump to vX.Y.Z"
git push origin main
git push --tags
```

That's it. Consumer repos will pick up the new version automatically on the next Claude Code session start (the bootstrap-check.sh auto-updater runs daily).

To force immediate update in all consumer repos: ask users to run `npm install` once, or wait for next day's session start.

---

## How auto-update works (consumer side)

Every time a non-technical user opens Claude Code, the `UserPromptSubmit` hook fires `bootstrap-check.sh`. This script:

1. Checks `.claude/.harness-last-update` timestamp — if less than 24h old, skips (no noise)
2. Reads the installed package version from `node_modules/@tron/claude-config/package.json`
3. Compares with the remote latest (via `git ls-remote` for git dependencies, or `npm show` for registry)
4. If outdated: runs `npm install --save-dev @tron/claude-config@latest --silent` then re-runs `setup-claude-harness.sh --silent`
5. Updates the timestamp regardless (so next check is 24h from now)

The entire process is silent. No user action required. The user may see one line like `[harness] updated v1.2.3 → v1.3.0` at most.

---

## Adding a new managed hook

1. Create the hook file in `managed/claude/hooks/your-hook.sh`
2. Add a copy step in `scripts/postinstall.js`:
   ```js
   copyFile('managed/claude/hooks/your-hook.sh', '.claude/hooks/your-hook.sh');
   ```
3. Wire it in `managed/claude/settings.json` under the appropriate hook type
4. Test locally: `node scripts/postinstall.js` in a consumer repo (dry run with `DRY=1`)
5. Release: bump version, push

---

## Adding a new git hook

1. Create the hook script in `managed/git-hooks/your-hook`
2. Make it executable: `chmod +x managed/git-hooks/your-hook`
3. Add install step in `scripts/postinstall.js`:
   ```js
   installGitHook('managed/git-hooks/your-hook', 'your-hook');
   ```
4. Release

---

## Modifying an existing hook

1. Edit the file in `managed/` (never directly in a consumer repo)
2. Test: copy the file to a consumer repo's `.claude/hooks/` and test manually
3. Release (bump version, push)
4. Consumer repos auto-update within 24h

---

## Testing before release

```bash
# In the tron-claude-config repo:
node scripts/postinstall.js --dry-run  # shows what would be copied/installed without writing

# In a consumer repo (manual test):
DRY=1 node node_modules/@tron/claude-config/scripts/postinstall.js

# Full integration test in a consumer repo:
git clone <consumer-repo> /tmp/test-consumer
cd /tmp/test-consumer
npm install
# verify .claude/settings.json is correct
# verify .git/hooks/pre-commit and pre-push are installed
# open Claude Code and verify hooks fire
```

---

## Rollback

If a bad version is released:

```bash
# In the tron-claude-config repo:
git revert HEAD
npm version patch
git push && git push --tags
```

Consumer repos will auto-update to the reverted version within 24h, or immediately on `npm install`.

To force-pin a consumer to a specific version (emergency):
```json
// consumer's package.json:
"@tron/claude-config": "git+https://github.com/org/tron-claude-config.git#v1.2.3"
```

---

## Versioning scheme

| Change type | Version bump | Examples |
|-------------|-------------|---------|
| Bug fix in hook script | `patch` | Fix bypass-check shell syntax |
| New hook or new enforcement rule | `minor` | Add new skill guard, add new tool to bootstrap |
| Breaking change (rename managed file, remove hook) | `major` | Rename settings.json key that consumers reference |

Keep a `CHANGELOG.md`. Non-technical users won't read it, but developers debugging auto-update issues will.

---

## Consumer onboarding (new repo)

Add to `package.json`:
```json
"devDependencies": {
  "@tron/claude-config": "git+https://github.com/org/tron-claude-config.git"
}
```

Then:
```bash
npm install
# postinstall runs automatically — hooks installed, git hooks installed
```

That's the entire onboarding. No further manual steps required.
