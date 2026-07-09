# @tron/claude-config

**Claude Code enforcement harness.** Drop this into any Node.js project and Claude instantly starts following your team's workflow rules — enforced via hooks, not vibes.

---

## What it does

| Enforcement | How |
|-------------|-----|
| Blocks raw `git commit` in terminal | `pre-commit` git hook |
| Blocks raw `git push` to main/master | `pre-push` git hook |
| Enforces code review before every commit | `/commit-changes` skill gates the commit |
| Enforces `/make-pr` for pull requests | `gh pr create` blocked unless called from the skill |
| Warns Claude when required tools are missing | `UserPromptSubmit` hook injects a note into every session |
| Self-updates silently, once per day | `bootstrap-check.sh` compares installed SHA vs remote HEAD |
| Installs [ECC coding rules](https://github.com/affaan-m/ECC) globally | Done once, on first session, into `~/.claude/rules/ecc/` |

The harness lives in your repo's `.claude/` folder and `.git/hooks/`. It does **not** touch your `CLAUDE.md`, `.claude/commands/`, or `.claude/settings.local.json`.

---

## Installation

### 1. Add the dependency

```json
// package.json
{
  "devDependencies": {
    "@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git"
  }
}
```

### 2. Install

```bash
npm install
# or: bun install
# or: pnpm install
```

That's it. The `postinstall` script runs automatically and sets everything up. No further steps.

> **Works with npm, bun, and pnpm.** The package manager is auto-detected from your lockfile.

---

## What gets installed

```
your-project/
├── .claude/
│   ├── settings.json              ← Claude Code hooks (merged, not overwritten)
│   └── hooks/
│       ├── bypass-check.sh        ← bypass token checker (used by skills)
│       └── bootstrap-check.sh     ← tool verifier + auto-updater (runs every session)
├── .git/hooks/
│   ├── pre-commit                 ← blocks direct terminal commits
│   └── pre-push                   ← blocks direct terminal pushes to main
└── scripts/
    └── setup-claude-harness.sh    ← re-runnable setup (used by auto-update)
```

Global (machine-level, installed once):

```
~/.claude/rules/ecc/               ← ECC coding rules (common, typescript, vue, react, …)
```

---

## How it works

### Commit enforcement

When Claude calls `git commit` directly, the `pre-commit` hook blocks it. The only path through is the `/commit-changes` skill, which:

1. Creates a bypass token file (`.claude/.commit-authorized`)
2. Runs `/code-review` and `/security-review`
3. Calls `git commit` — the hook reads the token, permits the commit, and deletes the token

Token files are automatically added to `.gitignore` and never committed.

### PR enforcement

Same pattern: `gh pr create` is blocked unless called from the `/make-pr` skill, which creates `.claude/.pr-authorized` first.

### Tool verification (every session)

`bootstrap-check.sh` runs on every Claude Code prompt via `UserPromptSubmit`. It checks for required tools and injects a warning into Claude's context if any are missing. The warning includes install instructions.

Default tools checked:

| Tool | Purpose |
|------|---------|
| `rtk` | Rust Token Killer — reduces token usage on shell ops |
| `gsd` | GSD task orchestration |
| `codebase-memory-mcp` | Structural code graph for Claude |

You can customize the tool list by editing `.claude/hooks/bootstrap-check.sh` in your repo.

### Auto-update (once per day)

Once per 24 hours, `bootstrap-check.sh` compares the installed SHA of this package against the remote HEAD. If they differ, it runs your package manager silently and reinstalls the hooks. Debounced via `.claude/.harness-last-update`.

### ECC rules

On the first session after install, the harness clones [affaan-m/ECC](https://github.com/affaan-m/ECC) temporarily, copies the rule folders into `~/.claude/rules/ecc/`, and removes the clone. No permanent network dependency. If already installed, this step is silently skipped.

---

## Skill requirements

This harness assumes your Claude Code setup has the `/commit-changes` and `/make-pr` skills. If you're using this outside of a Tron repo, you'll need to either:

- Add those skills to your `~/.claude/commands/` folder, **or**
- Edit `.claude/hooks/bypass-check.sh` to remove the bypass mechanism (makes the hooks block all commits)

---

## Emergency bypass

```bash
# Skip pre-commit hook (emergencies only):
git commit --no-verify -m "your message"

# Skip pre-push hook:
git push --no-verify

# Temporarily disable the harness for one repo:
rm .git/hooks/pre-commit .git/hooks/pre-push
```

---

## Updating this package

Push changes to `main` in this repo. All consuming projects pick up the update automatically on their next daily check (or immediately on the next `npm install`).

```bash
# After editing files in managed/:
npm version patch   # bug fix in a script
npm version minor   # new hook or rule
npm version major   # breaking rename or removal

git add -A
git commit -m "fix: your change"
git push origin main
git push --tags
```

### Adding a new managed file

1. Add the file under `managed/`
2. Add a copy entry in `scripts/postinstall.js` (the `MANAGED_FILES` array)
3. If it's a Claude hook, add the reference to `managed/claude/settings.json`
4. Bump version and push

See [MAINTAINER.md](MAINTAINER.md) for the full maintainer guide.

---

## Uninstalling

```bash
# Remove git hooks:
rm .git/hooks/pre-commit .git/hooks/pre-push

# Remove the package:
npm uninstall @tron/claude-config

# Optionally remove Claude hooks:
rm .claude/hooks/bypass-check.sh .claude/hooks/bootstrap-check.sh
```

---

## Package structure

```
tron-claude-config/
├── package.json
├── scripts/
│   └── postinstall.js             ← copies managed files into the consumer repo
├── managed/
│   ├── claude/
│   │   ├── settings.json          ← Claude Code hooks config
│   │   └── hooks/
│   │       ├── bypass-check.sh    ← bypass token access control
│   │       └── bootstrap-check.sh ← tool check + ECC install + auto-update
│   ├── git-hooks/
│   │   ├── pre-commit             ← blocks direct terminal commits
│   │   └── pre-push               ← blocks direct terminal pushes to main
│   └── setup-claude-harness.sh   ← idempotent setup script
├── MAINTAINER.md
└── README.md
```
