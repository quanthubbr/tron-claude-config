# Claude Enforcement Harness — Practical Guide

> Quick reference: what the harness installs, what it enforces, and how to operate it day to day.  
> Consumer pitch + install story: [README.md](README.md) · Releases: [MAINTAINER.md](MAINTAINER.md)

**Current package version:** `1.6.1`

---

## What it does

### Files installed into every consumer repo

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Claude Code hooks — blocks direct `git commit` / `gh pr create`, runs bootstrap on every prompt |
| `.claude/hooks/bypass-check.sh` | Token gate (`.claude/.commit-authorized` / `.claude/.pr-authorized`). For `pr`, also requires all 5 PR section headers in `.claude/.pr-body-draft.md` |
| `.claude/hooks/bootstrap-check.sh` | Every prompt: tool warnings. Daily: silent package auto-update + re-run setup |
| `.claude/rules/ecc/` | Scoped ECC coding rules (`common` + stack-matched folders) |
| `.claude/.ecc-scope.json` | Last detected ECC scope (folders + signals) |
| `AGENTS.md` | Agent contract copied from the package |
| `.git/hooks/pre-commit` | Blocks terminal `git commit` without the commit token |
| `.git/hooks/pre-push` | Blocks direct push to `main`/`master`; prefers `/commit-changes` / `/make-pr` |
| `scripts/setup-claude-harness.sh` | Re-runnable setup (git hooks, tool check, ECC sync) |

`package.json` → `postinstall` runs the orchestrator on every `npm` / `bun` / `pnpm` install.

### What is enforced

| Gate | Rule |
|------|------|
| `/commit-changes` | Only official commit path. **Must** run `/security-review` then `/code-review` before creating the bypass token. Bundled (install-if-missing). |
| `/code-review` | Required quality gate. Bundled (install-if-missing). |
| `/security-review` | Required security gate. Bundled (install-if-missing). |
| `/make-pr` | Only official PR path. Bundled (install-if-missing). |
| PR body | `gh pr create` blocked unless draft has: Resumo, Principais mudanças, Arquitetura & implementação, Antes → Agora, Roteiro de teste |
| Terminal `git commit` | Blocked by `pre-commit` without token |
| Push to `main`/`master` | Blocked by `pre-push` |
| Missing tools | Warning injected into Claude context each session |
| Outdated package | Silent auto-update, once per 24h |

### Machine-level installs (developers only — skipped in CI)

| Tool | Installed to | How |
|------|-------------|-----|
| `/commit-changes` | `~/.claude/commands/commit-changes.md` | Bundled skill, install-if-missing |
| `/code-review` | `~/.claude/commands/code-review.md` | Bundled skill, install-if-missing |
| `/security-review` | `~/.claude/commands/security-review.md` | Bundled skill, install-if-missing |
| `/make-pr` | `~/.claude/commands/make-pr.md` | Bundled skill, install-if-missing |
| Karpathy enforcement rule | `~/.claude/rules/harness-enforcement.md` | Copied from package |
| Agent isolation / harness patterns | `~/.claude/rules/` | Copied from package |
| Karpathy skill | `~/.claude/skills/andrej-karpathy-skills/` | Copied from package |
| gsd | global `$PATH` | `npm install -g gsd-core` (or bun/pnpm) |
| caveman | `~/.claude/skills/caveman/` | Official install script |
| codebase-memory-mcp | `~/.claude/.mcp.json` | Official install script |

---

## Official commit flow

```
/security-review  →  /code-review  →  touch .claude/.commit-authorized  →  git commit  →  push
```

CRITICAL/HIGH findings from either review **block** the token. Do not create `.claude/.commit-authorized` until both pass.

---

## Code quality layers

| Layer | Source | Priority | Scope |
|-------|--------|----------|-------|
| **ECC rules** | `.claude/rules/ecc/` | Highest for rules | Naming, testing, security, git |
| **Karpathy principles** | `~/.claude/rules/harness-enforcement.md` | Highest for behavior | Simplicity, surgical changes |
| **Harness skills** | `~/.claude/commands/*` | Workflow | Commit / PR gates |

**ECC wins on coding standards.** **Karpathy wins on how to approach the task.**

### Scoped ECC sync

`scripts/lib/detect-project-scope.js` + `scripts/lib/install-ecc-rules.js`:

- Always install `common`
- Add language/framework folders only when the consumer stack matches
- Prune managed folders that fall out of scope on the next sync
- Triggered from `postinstall` and `setup-claude-harness.sh` (including after auto-update)

Manual re-sync:

```bash
node node_modules/@tron/claude-config/scripts/sync-ecc-rules.js .
# dry-run:
node node_modules/@tron/claude-config/scripts/sync-ecc-rules.js . --dry-run
```

---

## Adding to a project

### Step 1 — dependency

```json
"devDependencies": {
  "@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git"
}
```

### Step 2 — install

```bash
npm install   # or bun / pnpm
```

**What install does automatically:**

- Copies Claude settings + hooks  
- Installs git hooks  
- Syncs scoped ECC rules into `.claude/rules/ecc/`  
- Copies `AGENTS.md`  
- Adds token/draft paths to `.gitignore`  
- On developer machines: installs skills, Karpathy rules, gsd, caveman, codebase-memory-mcp  

---

## Maintaining the package

See [MAINTAINER.md](MAINTAINER.md).

### Quick update loop

```bash
# 1. Edit under managed/ or scripts/
# 2. Bump version
npm version patch   # fix
npm version minor   # new hook / skill / rule
# 3. Commit + push main (+ tags)
```

### How projects receive updates

- **Automatic:** `bootstrap-check.sh` once/day → package manager install → `setup-claude-harness.sh --silent`  
- **Immediate:** `npm install` (or bun/pnpm) in the consumer  

### Versioning

| Change type | Bump |
|-------------|------|
| Fix in an existing script | `patch` |
| New hook, rule, or skill | `minor` |
| Breaking rename/removal of a managed file | `major` |

---

## Emergency bypass

```bash
git commit --no-verify -m "message"
git push --no-verify

rm .git/hooks/pre-commit .git/hooks/pre-push
# then remove the dependency and reinstall
```

---

## Package structure

```
tron-claude-config/
├── package.json                              # v1.6.1
├── scripts/
│   ├── postinstall.js                        # orchestrator
│   ├── sync-ecc-rules.js                     # ECC re-sync CLI
│   └── lib/
│       ├── detect-project-scope.js           # stack → ECC folders
│       └── install-ecc-rules.js              # clone / copy / prune
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh
│   ├── claude/
│   │   ├── settings.json
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh
│   │   │   └── bootstrap-check.sh
│   │   └── rules/
│   │       ├── harness-enforcement.md
│   │       ├── agent-isolation.md
│   │       └── harness-patterns.md
│   ├── git-hooks/
│   │   ├── pre-commit
│   │   └── pre-push
│   └── skills/
│       ├── commit-changes/SKILL.md
│       ├── code-review/SKILL.md
│       ├── security-review/SKILL.md
│       ├── make-pr/SKILL.md
│       └── andrej-karpathy-skills/.../SKILL.md
├── docs/assets/                              # README visuals
├── HARNESS-GUIDE.md
├── MAINTAINER.md
└── README.md
```
