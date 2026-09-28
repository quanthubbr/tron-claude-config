# tron-claude-config — Maintainer Guide

Owner playbook for the shared Claude enforcement harness (`@tron/claude-config` **v1.9.1**).

Consumer docs: [README.md](README.md) · Operator cheat sheet: [HARNESS-GUIDE.md](HARNESS-GUIDE.md)

---

## What this package does

On consumer `npm install` / `bun install` / `pnpm install`, `scripts/postinstall.js`:

1. Copies managed Claude settings + hooks into `.claude/`
2. Copies `AGENTS.md` and `scripts/setup-claude-harness.sh`
3. Installs git `pre-commit` / `pre-push` hooks (via `git rev-parse --git-path hooks`, respects `core.hooksPath`)
4. Syncs **scoped** tron-kit rules into `.claude/rules/tron/` from the bundled snapshot (detect stack → copy matching folders → prune stale ones; no network)
5. On developer machines (not CI): installs the `tron-kit@tron` Claude plugin (see [Syncing tron-kit from upstream](#syncing-tron-kit-from-upstream)) and removes the legacy upstream plugin, its marketplace and user-level rules; install-if-missing skills + Karpathy rules, gsd, caveman; **attempt** codebase-memory-mcp via `scripts/lib/ensure-codebase-memory.js` (retries + npm fallback on Windows/WSL; warns instead of aborting postinstall if still missing)
6. On developer machines (not CI): installs the **frontend design skill harness** — the **Emil + Impeccable + Taste** combo (maximum DESIGN source of truth), with **tron-design-fallback** subordinate (charts, forms, web navigation, stack guidelines); removes leftover `ui-ux-pro-max` / `frontend-design` skill folders and disables the `frontend-design@claude-plugins-official` plugin (see [Frontend design skills](#frontend-design-skills-max-design-authority))
7. Thereafter, `bootstrap-check.sh` self-updates the package about once per day

Non-technical users get gates without extra setup. Engineers get them on install.

---

## Frontend design skills (MAX DESIGN authority)

The harness ships a full frontend design stack, vendored in-repo and installed on developer machines. Authority order (enforced by `managed/AGENTS.md` and `managed/cursor/rules/frontend-skills.mdc`):

1. **Emil Kowalski + Impeccable + Taste** — the **maximum source of truth for DESIGN**.
2. **tron-design-fallback** — **subordinate**; consulted only after the combo sets direction, and only for charts/data viz, form UX, web navigation patterns and stack guidelines (Vue, Nuxt, React, Next.js, React Native, shadcn/ui, Tailwind).

**On conflict, the Emil + Impeccable + Taste combo always wins.** Do not weaken this rule when editing skill docs. Agents announce `Using Emil + Impeccable + Taste for [purpose]`, appending `(+ tron-design-fallback)` only when it was consulted.

The former ui-ux-pro-max and frontend-design layer was removed: its direction-setting data competed with the combo and the rest was already covered. Only the missing pieces were extracted into `tron-design-fallback` (attribution line kept in its `SKILL.md`). Do not re-add a second direction-setting layer.

| Skill set | Vendored under | Install behavior |
|-----------|----------------|------------------|
| Emil Kowalski | `managed/skills/emilkowalski/` | `installEmilSkills()` → `~/.agents/skills/<name>/` + symlinks into `~/.claude/skills/` and `~/.cursor/skills/` (copy fallback) |
| Taste (leonxlnx) | `managed/skills/leonxlnx/` | `installTasteSkills()` → `~/.agents/skills/<name>/` + symlinks into `~/.claude/skills/` and `~/.cursor/skills/` (copy fallback) |
| Impeccable | `managed/skills/impeccable/` (+ `managed/agents/impeccable-*.md`, `managed/hooks/{cursor,github}/`) | `installImpeccable()` copies into `~/.claude/skills/`, `~/.cursor/skills/`, `~/.github/skills/impeccable/`; `impeccable-*` agents → `~/.claude/agents/` + `~/.cursor/agents/`. `installImpeccableHooks()` templates hooks into consumer `.cursor/hooks.json` + `.github/hooks/impeccable.json`. The `darwin-arm64` engine binary is vendored under `scripts/bin/`; other platforms download the pinned, checksum-verified binary on first run |
| tron-design-fallback | `managed/skills/tron-design-fallback/` (`SKILL.md` + `references/stacks/*.md`) | `installTronDesignFallback()` → `~/.claude/skills/tron-design-fallback/` + `~/.cursor/skills/tron-design-fallback/` (always synced, overwritten) |
| Legacy design cleanup | — | `removeLegacyDesignSkills()` deletes `ui-ux-pro-max` / `frontend-design` from `~/.{claude,cursor,agents,github}/skills/` (symlinks unlinked, not followed) and calls `disablePlugin('frontend-design@claude-plugins-official')` from `scripts/lib/install-tron-kit.js` (`claude plugin disable --scope <scope>` when installed + enabled; settings.json `enabledPlugins[...] = false` fallback) |
| frontend-skills rule | `managed/cursor/rules/frontend-skills.mdc` | `installFrontendSkillsRule()` → `~/.cursor/rules/frontend-skills.mdc` (always synced) |

To add or update a design skill, edit the vendored source under `managed/skills/{emilkowalski,leonxlnx,impeccable,tron-design-fallback}/`, keep the install function in `postinstall.js` in sync, and bump the version (`minor` for a new skill). The stack references in `tron-design-fallback/references/stacks/` are hand-maintained (High-severity rules only); keep them terse.

---

## File structure

```
tron-claude-config/
├── package.json
├── scripts/
│   ├── postinstall.js                 # install orchestrator
│   ├── sync-tron-rules.js             # CLI wrapper for tron-kit rules sync
│   ├── sync-tron-kit.js               # maintainer-only: refresh managed/tron-kit/ from upstream
│   └── lib/
│       ├── detect-project-scope.js    # package.json + markers → folder list
│       ├── install-tron-rules.js      # copy from snapshot, prune, write .tron-scope.json
│       ├── install-tron-kit.js        # ~/.claude/tron-kit + claude plugin install, legacy cleanup
│       └── ensure-codebase-memory.js  # required MCP guarantee (Win + Unix)
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh        # also re-syncs tron-kit rules on auto-update
│   ├── tron-kit/                      # frozen tron-kit plugin snapshot → ~/.claude/tron-kit/
│   ├── tron-kit.config.json           # snapshot pin, include/exclude, rewrites
│   ├── agents/                        # impeccable-* subagents → ~/.claude/agents/, ~/.cursor/agents/
│   ├── cursor/rules/                  # frontend-skills.mdc → ~/.cursor/rules/
│   ├── hooks/                         # cursor/ + github/ impeccable hook templates
│   ├── claude/
│   │   ├── settings.json
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh        # commit/pr tokens + PR template headers
│   │   │   └── bootstrap-check.sh     # tools + daily update
│   │   └── rules/
│   │       ├── harness-enforcement.md
│   │       ├── agent-isolation.md
│   │       ├── harness-patterns.md
│   │       └── caveman.md              # always-on communication enforce
│   ├── git-hooks/
│   │   ├── pre-commit
│   │   └── pre-push
│   └── skills/
│       ├── commit-changes/SKILL.md    # → ~/.claude/commands/commit-changes.md
│       ├── code-review/SKILL.md       # → ~/.claude/commands/code-review.md
│       ├── security-review/SKILL.md   # → ~/.claude/commands/security-review.md
│       ├── make-pr/SKILL.md           # → ~/.claude/commands/make-pr.md
│       ├── emilkowalski/<name>/       # Emil — → ~/.agents/skills/ (+ symlinks)
│       ├── impeccable/                # Impeccable — → ~/.claude, ~/.cursor, ~/.github + agents + hooks
│       ├── leonxlnx/<name>/           # Taste — → ~/.agents/skills/ (+ symlinks)
│       ├── tron-design-fallback/      # → ~/.claude + ~/.cursor skills (subordinate)
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
| `.claude/rules/tron/` | **Package** (re-synced) | Scope follows consumer stack |
| `.claude/.tron-scope.json` | **Package** | Audit trail of last sync |
| `AGENTS.md` | **Package** | Overwritten from managed copy |
| `.git/hooks/pre-commit` / `pre-push` | **Package** | Installed by setup |
| `~/.claude/commands/commit-changes.md` | **Package** (install-if-missing) | Must run `/security-review` + `/code-review` before token |
| `~/.claude/commands/code-review.md` | **Package** (install-if-missing) | Required by `/commit-changes` |
| `~/.claude/commands/security-review.md` | **Package** (install-if-missing) | Required by `/commit-changes` |
| `~/.claude/commands/make-pr.md` | **Package** (always synced) | PT-BR PR template; overwrites stale English skills |
| `~/.agents/skills/<emil/taste>/` + `~/.claude` + `~/.cursor` symlinks | **Package** (vendored, symlink/copy) | Emil + Taste = primary DESIGN authority |
| `~/.claude` + `~/.cursor` + `~/.github/skills/impeccable/` (+ agents + repo hooks) | **Package** (vendored, copied) | Impeccable = primary DESIGN authority; darwin-arm64 binary in-tree, others fetch on first run |
| `~/.claude` + `~/.cursor/skills/tron-design-fallback/` | **Package** (always synced) | Subordinate to the combo |
| `~/.{claude,cursor,agents,github}/skills/{ui-ux-pro-max,frontend-design}` | **Package** (removed if present) | Legacy design layer; plugin `frontend-design@claude-plugins-official` disabled |
| `~/.cursor/rules/frontend-skills.mdc` | **Package** (always synced) | Encodes the design authority order |
| `~/.claude/tron-kit/` + plugin `tron-kit@tron` | **Package** (always synced) | Version stamped from `package.json`; installed via `claude plugin`, settings.json fallback |
| `~/.claude/rules/caveman.md` | **Package** (always overwrite) | Caveman communication — mandatory every session |
| `~/.claude/.mcp.json` (`codebase-memory*`) | **Package** (ensure on install) | Required MCP — setup script warns if missing; postinstall no longer aborts |
| `.claude/PR-TEMPLATE.md` | **Package** | Canonical PT-BR PR body scaffold |
| `.claude/hooks/lib/pr-template-validate.cjs` | **Package** | PR body + `gh pr create` command validation |
| `.claude/.pr-body-draft.md` | **Ephemeral** (gitignored) | Written by `/make-pr`, validated by hook |
| `.claude/.commit-authorized` / `.pr-authorized` | **Ephemeral** (gitignored) | One-shot bypass tokens |
| `.claude/.harness-last-update` | **Ephemeral** (gitignored) | Last harness sync timestamp |
| `.cursor/` | **Ephemeral** (gitignored) | Machine-local Cursor hooks (`.cursor/hooks.json`); team-shared hooks stay under `.github/hooks/` |
| `.omc/` | **Ephemeral** (gitignored) | OMC session/runtime state (`.omc/state/`, handoffs, notepad, etc.) |
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
3. If outdated: package-manager install of `@tron/claude-config`, then `setup-claude-harness.sh --silent` (hooks + **tron-kit rules re-sync**)  
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

## Changing tron-kit scope detection

1. Edit `scripts/lib/detect-project-scope.js`  
2. Dry-run: `node scripts/sync-tron-rules.js /path/to/consumer --dry-run`  
3. Confirm prune behavior for folders that leave scope  
4. Patch/minor bump as appropriate  

---

## Syncing tron-kit from upstream

`managed/tron-kit/` is a **frozen snapshot** of the MIT-licensed upstream [affaan-m/ECC](https://github.com/affaan-m/ECC) Claude plugin (formerly installed as `ecc@ecc`), renamed and owned by this package. Consumers never fetch upstream: postinstall copies the snapshot to `~/.claude/tron-kit/`, stamps `.claude-plugin/plugin.json` + the `marketplace.json` entry with this package's `version` (so `claude plugin update` sees each release), and installs `tron-kit@tron` at user scope. The upstream `LICENSE` stays in the snapshot for attribution.

Refresh the snapshot (maintainers only, needs network):

```bash
npm run sync:tron-kit                      # re-pull the pinned upstream.ref
npm run sync:tron-kit -- --dry-run         # fetch + apply rules in a tmp dir, print counts, touch nothing
npm run sync:tron-kit -- --latest          # take upstream HEAD and write the new sha into the config
npm run sync:tron-kit -- --ref <sha|branch> # sync a specific ref (resolved sha written into the config)
```

Everything the sync does is driven by `managed/tron-kit.config.json`:

- `upstream.repo` / `upstream.ref` — source and pinned sha
- `include` — top-level upstream paths copied (no `node_modules`, docs, assets, tests or other harness dot-dirs)
- `exclude` — globs never brought back. `save-session` is excluded because `/session-handoff` replaces it; the upstream self-installer (`configure-ecc`) and self-updater (`auto-update`) are excluded because they would reinstall upstream outside this snapshot; the upstream frontend design, motion and accessibility skills (`design-system`, `frontend-design-direction`, `motion-*`, `liquid-glass-design`, `accessibility`, `frontend-a11y`, `loop-design-check`, `inherit-legacy-style`) are excluded because they compete with the Emil + Impeccable + Taste combo. Implementation skills (`frontend-patterns`, `nuxt4-patterns`, `ui-to-vue`, `swiftui-patterns`, `frontend-slides`, `remotion-*`, `dashboard-builder`, …) stay
- `rewrites` — literal find/replace applied after copy. They retarget the hook/command root resolvers from the upstream plugin slugs to `tron-kit` / `tron-kit@tron` / `marketplaces/tron` / cache dir `tron`, and swap `/save-session` mentions for `/session-handoff`. Each rewrite asserts `minMatches`; the sync aborts with a clear error if upstream drifted — fix the rule, never loosen it blindly
- `hooks.stripMatcherKeys` — keys removed from `hooks/hooks.json` matcher entries (matches how the plugin was installed before the migration)
- `plugin` / `marketplace` — metadata for the generated `.claude-plugin/plugin.json` and `marketplace.json`

The sync also writes `managed/tron-kit/UPSTREAM.json` (repo, resolved sha, upstream version, timestamp, excluded paths, rewrite counts). After a sync: review the diff, run `claude plugin validate managed/tron-kit`, then release with a `minor` bump.

---

## Testing before release

```bash
# Syntax
node --check scripts/postinstall.js
node --check scripts/lib/detect-project-scope.js
node --check scripts/lib/install-tron-rules.js
node --check scripts/lib/install-tron-kit.js
node --check scripts/sync-tron-kit.js
node --check scripts/lib/ensure-codebase-memory.js
node scripts/lib/pr-template-validate.test.js

# codebase-memory readiness (no install if already registered)
node -e "console.log(require('./scripts/lib/ensure-codebase-memory').isCodebaseMemoryReady())"

# Scope detection (no network)
node -e "console.log(require('./scripts/lib/detect-project-scope').detectProjectScope('.'))"

# tron-kit rules dry-run (local snapshot, no network)
node scripts/sync-tron-rules.js /tmp/some-consumer --dry-run

# Plugin manifest check
claude plugin validate managed/tron-kit

# Consumer dry install
DRY=1 INIT_CWD=/path/to/consumer node scripts/postinstall.js
```

Integration checklist in a throwaway clone:

- [ ] `.claude/settings.json` + both hooks present  
- [ ] `.git/hooks/pre-commit` / `pre-push` executable  
- [ ] `.claude/rules/tron/common` exists; stack folders match the app  
- [ ] `claude plugin list` shows `tron-kit@tron` enabled and no legacy upstream plugin  
- [ ] `~/.claude/commands/{commit-changes,code-review,security-review,make-pr}.md` present (or intentionally left as pre-existing customs)  
- [ ] Raw `git commit` blocked; token path works  
- [ ] `~/.claude/.mcp.json` has a `codebase-memory*` server (or CI skipped machine installs)  
- [ ] `~/.claude/rules/caveman.md` present after install  

---

## quanthubbr mirror sync

[quanthubbr/tron-claude-config](https://github.com/quanthubbr/tron-claude-config) is an **org mirror** of this repo — not a GitHub fork, so there is no upstream PR button.

**Canonical repo:** `zaqueu-1/tron-claude-config` (development + releases)  
**Mirror repo:** `quanthubbr/tron-claude-config` (quanthub consumer repos install from here)

### Automatic sync (GitHub Actions — on the **mirror** repo)

Workflow `.github/workflows/sync-from-upstream.yml` is committed here but **runs only on** `quanthubbr/tron-claude-config`. On the canonical repo the job is always skipped.

After the workflow file is on the mirror `main` branch:

1. **quanthubbr/tron-claude-config → Actions** — enable workflows if prompted  
2. **Settings → Secrets and variables → Actions** (optional):
   - `UPSTREAM_TOKEN` — only if `zaqueu-1/tron-claude-config` is private (read access)  
   - If public, no secret needed — `GITHUB_TOKEN` pushes on the mirror
3. Run **Sync from upstream** manually once, or wait for the daily schedule (06:00 UTC)

The workflow fast-forwards `main` and pushes tags from the canonical repo. It fails if the mirror diverged — resolve before re-running.

### Manual push (only with git push access to mirror)

```bash
git remote add quanthub https://github.com/quanthubbr/tron-claude-config.git  # once
git checkout main && git pull origin main
npm run sync:quanthub
```

Dry-run: `bash scripts/sync-quanthub-fork.sh --check`

### Pull mirror-only commits → canonical (rare)

```bash
bash scripts/sync-quanthub-fork.sh --pull
git push origin main
```

### quanthub consumer `package.json`

```json
"@tron/claude-config": "git+https://github.com/quanthubbr/tron-claude-config.git"
```

Pin versions with tags: `#v1.7.0`

---

## Rollback

```bash
git revert HEAD
npm version patch
git push && git push --tags
```

Pin a consumer in an emergency:

```json
"@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git#v1.7.0"
```

---

## Versioning scheme

| Change type | Bump | Examples |
|-------------|------|----------|
| Bug fix in hook/script | `patch` | Shell syntax, false-positive scope |
| New hook, skill, or enforcement | `minor` | New review skill, new tron-kit scope detector |
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
