# Claude Enforcement Harness — Practical Guide

> Quick reference for understanding what the harness does, how to add it to a project, and how to maintain the package.

---

## What it does

Files installed into every consumer repo:

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Claude Code hooks — blocks direct `git commit` and `gh pr create`, runs bootstrap on every prompt |
| `.claude/hooks/bypass-check.sh` | Reads a token file (`.claude/.commit-authorized` or `.claude/.pr-authorized`). If present → allows the command and deletes the token. For `pr`, also validates that `.claude/.pr-body-draft.md` contains all 5 canonical PR-template sections before allowing `gh pr create` through — the body-content check, not just the token, is what makes the template mandatory. If absent → blocks with an error. |
| `.claude/hooks/bootstrap-check.sh` | Runs on every Claude prompt. Checks that `gsd` and `codebase-memory-mcp` are installed. Once per day also checks for a `@tron/claude-config` update and applies it silently. |
| `.claude/git-hooks/pre-commit` | Source for the git hook. Blocks direct `git commit` from the terminal. |
| `.claude/git-hooks/pre-push` | Source for the git hook. Blocks direct `git push` to main/master. |
| `scripts/setup-claude-harness.sh` | Setup script: installs git hooks into `.git/hooks/`, checks tools, auto-detects package manager (npm/pnpm/bun). |
| `package.json` → `postinstall` | Runs setup automatically on every `npm install` / `bun install` / `pnpm install`. |

**What is enforced:**
- `/commit-changes` → only path to commit via Claude (runs `/code-review` + `/security-review` automatically)
- `/make-pr` → only path to open a PR via Claude, and installed automatically by the package (install-if-missing at `~/.claude/commands/make-pr.md` — never overwrites a developer's own customized version)
- PR body template → every `gh pr create` is blocked unless the body (written to `.claude/.pr-body-draft.md`, passed via `--body-file`) has all 5 canonical sections: Resumo, Principais mudanças, Arquitetura & implementação, Antes → Agora, Roteiro de teste. Enforced by `bypass-check.sh`, so it applies even if a repo has its own customized `/make-pr`.
- `git commit` directly in terminal → blocked by `pre-commit` git hook
- `git push` directly to main/master → blocked by `pre-push` git hook
- Missing tools → warning injected into Claude's context every session
- Outdated package → silent auto-update, once per day

Machine-level tools installed once per developer machine (skipped in CI):

| Tool | Installed to | How |
|------|-------------|-----|
| Karpathy enforcement rule | `~/.claude/rules/harness-enforcement.md` | Copied from package (bundled) |
| Karpathy skill | `~/.claude/skills/andrej-karpathy-skills/` | Copied from package (bundled, no network) |
| gsd | global `$PATH` | `npm install -g gsd-core` |
| caveman | `~/.claude/skills/caveman/` | Official install script via `curl` |

---

## Code quality layers

Two layers work together automatically, with no user action:

| Layer | Source | Priority | Scope |
|-------|--------|----------|-------|
| **ECC rules** | `.claude/rules/ecc/` | Highest for rules | Standards: naming, testing, security, git |
| **Karpathy principles** | `~/.claude/rules/harness-enforcement.md` | Highest for behavior | Simplicity, surgical changes, goal-driven execution |

**ECC takes priority over Karpathy on rules.** When they conflict on coding standards, follow ECC.

**Karpathy takes priority on behavioral skills.** When they conflict on how to approach a task, follow Karpathy.

The Karpathy principles live inline in `harness-enforcement.md` — a global rule file Claude Code loads every session automatically, with zero per-task tool call overhead. The skill file is also installed for explicit `Skill("karpathy-guidelines")` invocations.

---

## Adding to a project

### Step 1 — Add the dependency

In `package.json`:

```json
"devDependencies": {
  "@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git"
}
```

### Step 2 — Install

```bash
npm install
# or: bun install
# or: pnpm install
```

Done. The `postinstall` script runs automatically and sets everything up. No further steps.

**What the install does automatically:**
- Copies `.claude/settings.json` (Claude Code hooks)
- Copies `.claude/hooks/bypass-check.sh` and `bootstrap-check.sh`
- Installs `.git/hooks/pre-commit` and `.git/hooks/pre-push`
- Adds token/draft files (including `.claude/.pr-body-draft.md`) to the project's `.gitignore`
- Installs ECC rules, Karpathy skill, enforcement rule, `/make-pr` skill, gsd, and caveman (developer machines only)

---

## Maintaining the package

See `MAINTAINER.md` for the full maintainer guide.

### Update a hook or rule

```bash
# 1. Edit the file in managed/:
nano managed/claude/hooks/bootstrap-check.sh

# 2. Bump version:
npm version patch   # for fixes
npm version minor   # for new hooks or rules

# 3. Commit and push:
git add -A
git commit -m "fix: describe the change"
git push origin main
git push --tags
```

### How projects receive updates

**Automatic (next day):** `bootstrap-check.sh` runs every Claude session and checks once per day whether the installed SHA differs from the remote HEAD. If so, it runs `npm install` / `bun install` / `pnpm install` silently and reinstalls the hooks.

**Immediate:** Any developer can run `npm install` (or bun/pnpm) to force an update now.

### Adding a new managed hook

1. Create the file under `managed/claude/hooks/new-hook.sh`
2. Add the copy entry to `scripts/postinstall.js` (`MANAGED_FILES` array)
3. Add the reference to `managed/claude/settings.json`
4. Bump version and push

### Adding a new machine-level tool

1. Add an `installX()` function to `scripts/postinstall.js`
2. Call it inside the `if (!IS_CI)` block
3. If it ships a file, add it under `managed/` and copy from `PACKAGE_ROOT`

### Versioning

| Change type | Bump |
|-------------|------|
| Fix in an existing script | `patch` |
| New hook, rule, or skill | `minor` |
| Breaking rename or removal of a managed file | `major` |

---

## Emergency bypass

```bash
# Skip pre-commit hook (emergency only):
git commit --no-verify -m "message"

# Skip pre-push hook:
git push --no-verify

# Uninstall the harness from a project:
rm .git/hooks/pre-commit .git/hooks/pre-push
# Remove the entry from package.json and run npm install
```

---

## Package structure

```
tron-claude-config/
├── package.json
├── scripts/
│   └── postinstall.js                      ← copies managed files; installs machine-level tools
├── managed/
│   ├── claude/
│   │   ├── settings.json                   ← Claude Code hooks config
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh             ← bypass token access control
│   │   │   └── bootstrap-check.sh          ← tool check + auto-update (every session)
│   │   └── rules/
│   │       └── harness-enforcement.md      ← priority + Karpathy principles (always-on rule)
│   ├── git-hooks/
│   │   ├── pre-commit                      ← blocks direct terminal commits
│   │   └── pre-push                        ← blocks direct terminal pushes to main
│   ├── skills/
│   │   ├── andrej-karpathy-skills/
│   │   │   └── karpathy-guidelines/
│   │   │       └── SKILL.md                ← Karpathy skill (bundled)
│   │   └── make-pr/
│   │       └── SKILL.md                    ← canonical /make-pr skill (installed to ~/.claude/commands/, install-if-missing)
│   └── setup-claude-harness.sh             ← idempotent setup script
├── MAINTAINER.md                           ← full maintainer guide
└── README.md                               ← quick install guide
```
