# @tron/claude-config

Claude Code enforcement harness for tron repos. Auto-installs on `npm install` / `bun install` / `pnpm install`.

## What it does

- Blocks raw `git commit` and `git push` — enforces `/commit-changes` and `/make-pr` skills
- Runs `/code-review` + `/security-review` before every commit (via the skills)
- Verifies required tools (`rtk`, `gsd`, `codebase-memory-mcp`) on each session start
- Self-updates silently, once per day — no manual intervention needed

## Adding to a repo

1. Add to `package.json`:
   ```json
   "devDependencies": {
     "@tron/claude-config": "git+https://github.com/ORG/tron-claude-config.git"
   }
   ```
2. Run `npm install` / `bun install` / `pnpm install`

That's it. The harness installs automatically. No further steps.

## What gets installed

- `.claude/settings.json` — Claude Code hooks
- `.claude/hooks/bypass-check.sh` — bypass token checker
- `.claude/hooks/bootstrap-check.sh` — tool verifier + auto-updater (daily)
- `.git/hooks/pre-commit` — blocks direct terminal commits
- `.git/hooks/pre-push` — blocks direct terminal pushes to main

Your `CLAUDE.md`, `.claude/commands/`, and `.claude/settings.local.json` are **never touched**.

## Emergency bypass

```bash
git commit --no-verify    # skip pre-commit hook
git push --no-verify      # skip pre-push hook
```

## Maintaining this package

See [MAINTAINER.md](MAINTAINER.md).
