# tron-claude-config — Maintainer Guide

Owner playbook for the shared Claude enforcement harness (`@tron/claude-config` **v1.6.1**).

Consumer docs: [README.md](README.md) · Operator cheat sheet: [HARNESS-GUIDE.md](HARNESS-GUIDE.md)

---

## What this package does

On consumer `npm install` / `bun install` / `pnpm install`, `scripts/postinstall.js`:

1. Copies managed Claude settings + hooks into `.claude/`
2. Copies `AGENTS.md` and `scripts/setup-claude-harness.sh`
3. Installs `.git/hooks/pre-commit` and `pre-push`
4. Syncs **scoped** ECC rules into `.claude/rules/ecc/` (detect stack → copy matching folders → prune stale ones)
5. On developer machines (not CI): install-if-missing skills + Karpathy rules, gsd, caveman, codebase-memory-mcp
6. Thereafter, `bootstrap-check.sh` self-updates the package about once per day

Non-technical users get gates without extra setup. Engineers get them on install.

---

## File structure

```
tron-claude-config/
├── package.json
├── scripts/
│   ├── postinstall.js                 # install orchestrator
│   ├── sync-ecc-rules.js              # CLI wrapper for ECC sync
│   └── lib/
│       ├── detect-project-scope.js    # package.json + markers → folder list
│       └── install-ecc-rules.js       # clone ECC, copy, prune, write .ecc-scope.json
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh        # also re-syncs ECC on auto-update
│   ├── claude/
│   │   ├── settings.json
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh        # commit/pr tokens + PR template headers
│   │   │   └── bootstrap-check.sh     # tools + daily update
│   │   └── rules/
│   │       ├── harness-enforcement.md
│   │       ├── agent-isolation.md
│   │       └── harness-patterns.md
│   ├── git-hooks/
│   │   ├── pre-commit
│   │   └── pre-push
│   └── skills/
│       ├── commit-changes/SKILL.md    # → ~/.claude/commands/commit-changes.md
│       ├── code-review/SKILL.md       # → ~/.claude/commands/code-review.md
│       ├── security-review/SKILL.md   # → ~/.claude/commands/security-review.md
│       ├── make-pr/SKILL.md           # → ~/.claude/commands/make-pr.md
│       └── andrej-karpathy-skills/... # → ~/.claude/skills/...
├── docs/assets/                       # README banner / diagrams
├── MAINTAINER.md
├── HARNESS-GUIDE.md
└── README.md
```

### Managed vs user-owned (consumer repos)

| File | Owner | Notes |
|------|-------|-------|
| `.claude/settings.json` | **Package** (overwritten on update) | Do not edit in consumers |
| `.claude/hooks/bypass-check.sh` | **Package** | Do not edit in consumers |
| `.claude/hooks/bootstrap-check.sh` | **Package** | Do not edit in consumers |
| `.claude/rules/ecc/` | **Package** (re-synced) | Scope follows consumer stack |
| `.claude/.ecc-scope.json` | **Package** | Audit trail of last sync |
| `AGENTS.md` | **Package** | Overwritten from managed copy |
| `.git/hooks/pre-commit` / `pre-push` | **Package** | Installed by setup |
| `~/.claude/commands/commit-changes.md` | **Package** (install-if-missing) | Must run `/security-review` + `/code-review` before token |
| `~/.claude/commands/code-review.md` | **Package** (install-if-missing) | Required by `/commit-changes` |
| `~/.claude/commands/security-review.md` | **Package** (install-if-missing) | Required by `/commit-changes` |
| `~/.claude/commands/make-pr.md` | **Package** (install-if-missing) | PR template still enforced by hook |
| `.claude/.pr-body-draft.md` | **Ephemeral** (gitignored) | Written by `/make-pr`, validated by hook |
| `.claude/.commit-authorized` / `.pr-authorized` | **Ephemeral** (gitignored) | One-shot bypass tokens |
| Repo-local `.claude/commands/*` (other) | **Repo** | Never overwritten |
| `CLAUDE.md` | **Repo** | Never overwritten |
| `.claude/settings.local.json` | **Repo** | Never touched |

`postinstall.js` only writes Package / ephemeral rows above.

---

## Official skill contract

`/commit-changes` order is fixed:

1. `/security-review` — BLOCK on CRITICAL/HIGH  
2. `/code-review` — BLOCK on CRITICAL/HIGH  
3. `touch .claude/.commit-authorized`  
4. `git commit` (hook consumes token)  
5. Push (pre-push accepts commit or PR token)

When editing `managed/skills/commit-changes/SKILL.md`, keep that order. When editing PR section headers, keep them in sync with `bypass-check.sh`.

---

## Releasing a new version

```bash
# 1. Change files under managed/ or scripts/
# 2. Bump semver
npm version patch   # or minor | major

# 3. Commit + push
git push origin main
git push --tags
```

Consumers pick up the release on the next daily bootstrap check, or immediately on `npm install`.

---

## How auto-update works (consumer)

`UserPromptSubmit` → `bootstrap-check.sh`:

1. Skip if `.claude/.harness-last-update` is less than 24h old  
2. Compare installed git SHA / version to remote  
3. If outdated: package-manager install of `@tron/claude-config`, then `setup-claude-harness.sh --silent` (hooks + **ECC re-sync**)  
4. Refresh the timestamp  

Silent by design. At most one status line in the session.

---

## Adding a new managed hook

1. Add `managed/claude/hooks/your-hook.sh`  
2. Register copy in `scripts/postinstall.js` (`MANAGED_FILES`)  
3. Wire in `managed/claude/settings.json`  
4. Test with `DRY=1` in a consumer  
5. Bump version + push  

## Adding a new git hook

1. Add executable under `managed/git-hooks/`  
2. Register in `GIT_HOOKS` inside `postinstall.js`  
3. Release  

## Adding a new global skill (install-if-missing)

1. Add `managed/skills/<name>/SKILL.md`  
2. Add `installXSkill()` in `postinstall.js` (copy to `~/.claude/commands/<name>.md` only if missing)  
3. Call it inside the `if (!IS_CI)` block  
4. Document in README + HARNESS-GUIDE + this table  
5. `npm version minor` + push  

## Changing ECC scope detection

1. Edit `scripts/lib/detect-project-scope.js`  
2. Dry-run: `node scripts/sync-ecc-rules.js /path/to/consumer --dry-run`  
3. Confirm prune behavior for folders that leave scope  
4. Patch/minor bump as appropriate  

---

## Testing before release

```bash
# Syntax
node --check scripts/postinstall.js
node --check scripts/lib/detect-project-scope.js
node --check scripts/lib/install-ecc-rules.js

# Scope detection (no network)
node -e "console.log(require('./scripts/lib/detect-project-scope').detectProjectScope('.'))"

# ECC dry-run (needs network)
node scripts/sync-ecc-rules.js /tmp/some-consumer --dry-run

# Consumer dry install
DRY=1 INIT_CWD=/path/to/consumer node scripts/postinstall.js
```

Integration checklist in a throwaway clone:

- [ ] `.claude/settings.json` + both hooks present  
- [ ] `.git/hooks/pre-commit` / `pre-push` executable  
- [ ] `.claude/rules/ecc/common` exists; stack folders match the app  
- [ ] `~/.claude/commands/{commit-changes,code-review,security-review,make-pr}.md` present (or intentionally left as pre-existing customs)  
- [ ] Raw `git commit` blocked; token path works  

---

## Rollback

```bash
git revert HEAD
npm version patch
git push && git push --tags
```

Pin a consumer in an emergency:

```json
"@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git#v1.6.1"
```

---

## Versioning scheme

| Change type | Bump | Examples |
|-------------|------|----------|
| Bug fix in hook/script | `patch` | Shell syntax, false-positive scope |
| New hook, skill, or enforcement | `minor` | New review skill, new ECC detector |
| Breaking rename/removal | `major` | Rename managed path consumers rely on |

Prefer a `CHANGELOG.md` for humans debugging auto-update surprises.

---

## Consumer onboarding (new repo)

```json
"devDependencies": {
  "@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git"
}
```

```bash
npm install
```

No further manual steps. Skills install on developer machines; CI skips machine-level tooling.
