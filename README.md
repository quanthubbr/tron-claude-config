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
| Installs [ECC coding rules](https://github.com/affaan-m/ECC) per project | Scoped via `package.json` → `.claude/rules/ecc/` |

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
│   ├── rules/
│   │   └── ecc/                   ← ECC rules (common + stack-specific folders)
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
~/.claude/rules/harness-enforcement.md                        ← priority rules + Karpathy principles (always-on)
~/.claude/skills/andrej-karpathy-skills/karpathy-guidelines/  ← Karpathy skill (explicit invocations)
~/.claude/commands/commit-changes.md                          ← canonical /commit-changes skill (install-if-missing)
~/.claude/commands/code-review.md                             ← canonical /code-review skill (install-if-missing)
~/.claude/commands/security-review.md                         ← canonical /security-review skill (install-if-missing)
~/.claude/commands/make-pr.md                                 ← canonical /make-pr skill (install-if-missing, see PR enforcement below)
```

---

## How it works

### Code quality enforcement

Two complementary layers enforce code quality automatically, with no user action required:

| Layer | Source | Priority | Scope |
|-------|--------|----------|-------|
| **ECC rules** | `.claude/rules/ecc/` | Highest for rules | Standards: naming, testing, security, git workflow |
| **Karpathy principles** | `~/.claude/rules/harness-enforcement.md` | Highest for behavior | How to think and act: simplicity, surgical changes, goal-driven execution |
| **Karpathy skill** | `~/.claude/skills/andrej-karpathy-skills/` | — | Explicit invocation via `Skill("karpathy-guidelines")` |

**ECC takes priority over Karpathy on rules.** When they conflict on coding standards (naming, structure, coverage), follow ECC.

**Karpathy takes priority on behavioral skills.** When they conflict on how to approach a task (assumptions, scope, success criteria), follow Karpathy.

The principles live directly in `harness-enforcement.md` (a global rule file Claude Code loads every session) — no Skill tool call overhead per task. The skill file is still installed for explicit `/karpathy-guidelines` invocations.

### Commit enforcement

When Claude calls `git commit` directly, the `pre-commit` hook blocks it. The only path through is the `/commit-changes` skill, which:

1. Creates a bypass token file (`.claude/.commit-authorized`)
2. Runs `/code-review` and `/security-review`
3. Calls `git commit` — the hook reads the token, permits the commit, and deletes the token

Token files are automatically added to `.gitignore` and never committed.

### PR enforcement

Same bypass-token pattern as commits, plus template validation: `gh pr create` is blocked unless

1. Called from the `/make-pr` skill, which creates `.claude/.pr-authorized` first, **and**
2. The PR body (written to `.claude/.pr-body-draft.md` and passed via `--body-file`, never inline `--body`) contains all 5 canonical sections: **Resumo**, **Principais mudanças**, **Arquitetura & implementação**, **Antes → Agora**, **Roteiro de teste**.

`/make-pr` is installed automatically (install-if-missing, `~/.claude/commands/make-pr.md`) and already produces a compliant body — this validation exists so the template is *enforced*, not just followed by convention: even a developer-customized `/make-pr` must still pass the same structural check, since it's the hook (not the skill) that has the final say. Sections that don't apply to a given PR should keep their header with a `_N/A — não aplicável a esta mudança_` placeholder rather than being omitted.

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

On `npm install`, and whenever `scripts/setup-claude-harness.sh` runs (including after a harness package update), the harness clones [affaan-m/ECC](https://github.com/affaan-m/ECC) temporarily, detects the consumer project's stack from `package.json` and project files, then syncs rule folders into `.claude/rules/ecc/`:

- **Always:** `common`
- **When detected:** `typescript`, `vue`, `nuxt`, `react`, `react-native`, `web`, `csharp`, and other ECC language folders (python, golang, etc.)

Folders outside the detected scope are removed on the next sync. State is recorded in `.claude/.ecc-scope.json`.

---

## Skill requirements

`/commit-changes`, `/code-review`, `/security-review`, and `/make-pr` are installed automatically by `postinstall.js` (install-if-missing — an existing customized skill is never overwritten):

- `/commit-changes` → runs `/security-review` + `/code-review`, then creates `.claude/.commit-authorized` and commits
- `/code-review` → quality/correctness review of staged or branch diff (required before commit)
- `/security-review` → security checklist on staged or branch diff (required before commit)
- `/make-pr` → creates `.claude/.pr-authorized`, writes the PR body draft, then opens the PR

If you're using this outside of a Tron repo and want to disable the gates, edit `.claude/hooks/bypass-check.sh` (makes the hooks block all commits and PRs unless you also remove the git hooks).

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
│   └── postinstall.js             ← copies managed files; installs machine-level tools
├── managed/
│   ├── claude/
│   │   ├── settings.json          ← Claude Code hooks config
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh    ← bypass token access control
│   │   │   └── bootstrap-check.sh ← tool check + auto-update (runs every session)
│   │   └── rules/
│   │       └── harness-enforcement.md  ← priority + Karpathy principles (always-on rule)
│   ├── git-hooks/
│   │   ├── pre-commit             ← blocks direct terminal commits
│   │   └── pre-push               ← blocks direct terminal pushes to main
│   ├── skills/
│   │   └── andrej-karpathy-skills/
│   │       └── karpathy-guidelines/
│   │           └── SKILL.md       ← Karpathy skill (bundled, no network needed)
│   └── setup-claude-harness.sh   ← idempotent setup script
├── MAINTAINER.md
└── README.md
```
