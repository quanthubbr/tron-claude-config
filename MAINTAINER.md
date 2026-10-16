# tron-claude-config — Maintainer Guide

Owner playbook for the shared Claude enforcement harness (`@tron/claude-config` **v1.15.3**).

Consumer docs: [README.md](README.md) · Operator cheat sheet: [HARNESS-GUIDE.md](HARNESS-GUIDE.md)

---

## What this package does

On consumer `npm install` / `bun install` / `pnpm install`, `scripts/postinstall.js`:

1. Copies managed Claude settings + hooks into `.claude/`
2. Copies `AGENTS.md` and `scripts/setup-claude-harness.sh`
3. Installs git `pre-commit` / `pre-push` hooks (via `git rev-parse --git-path hooks`, respects `core.hooksPath`)
4. Syncs **scoped** tron-kit rules into `.claude/rules/tron/` from the bundled snapshot (detect stack → copy matching folders → prune stale ones; no network)
5. On developer machines (not CI): installs the `tron-kit@tron` Claude plugin (see [Syncing tron-kit from upstream](#syncing-tron-kit-from-upstream)) and removes the legacy upstream plugin, its marketplace and user-level rules; installs the 12 tron agents + roster guard hooks (`scripts/lib/install-tron-agents.js`); the workflow engine with the `standard` profile for Claude Code and Cursor; always-synced commands, skills and rules (every file recorded in `~/.claude/tron/installed.json`, so files a release drops are removed on upgrade); always-overwritten core rules (`terse.md`, `engineering-principles.md`, removing their retired predecessors); **attempt** `tron-graph` via `scripts/lib/ensure-tron-graph.js` (retries + npm fallback on Windows/WSL; renames the engine's own MCP keys to `tron-graph`; warns instead of aborting postinstall if still missing) and registers `tron-docs` via `scripts/lib/ensure-tron-docs.js`
6. On developer machines (not CI): installs the **frontend design skill harness** — the **tron design stack** (`tron-design`, `tron-motion`, `tron-native`, `tron-imagery` — maximum DESIGN source of truth), with **tron-design-fallback** subordinate (charts, forms, web navigation, stack guidelines); removes leftover `ui-ux-pro-max` / `frontend-design` and retired design skill folders and disables the `frontend-design@claude-plugins-official` plugin (see [Frontend design skills](#frontend-design-skills-max-design-authority))
7. Thereafter, `bootstrap-check.sh` self-updates the package about once per day

Non-technical users get gates without extra setup. Engineers get them on install.

---

## Frontend design skills (MAX DESIGN authority)

The harness ships a full frontend design stack, vendored in-repo and installed on developer machines. Authority order (enforced by `managed/AGENTS.md` and `managed/cursor/rules/frontend-skills.mdc`):

1. **tron design stack** — `tron-design` (always first), `tron-motion`, `tron-native`, `tron-imagery` — the **maximum source of truth for DESIGN**.
2. **tron-design-fallback** — **subordinate**; consulted only after the stack sets direction, and only for charts/data viz, form UX, web navigation patterns and stack guidelines (Vue, Nuxt, React, Next.js, React Native, shadcn/ui, Tailwind).

**On conflict, the tron design stack always wins.** Do not weaken this rule when editing skill docs. Agents announce `Using tron-design for [purpose]`, naming each companion skill actually loaded.

The former ui-ux-pro-max and frontend-design layer was removed: its direction-setting data competed with the stack and the rest was already covered. Only the missing pieces were extracted into `tron-design-fallback` (attribution line kept in its `SKILL.md`). Do not re-add a second direction-setting layer.

| Skill set | Vendored under | Install behavior |
|-----------|----------------|------------------|
| tron design stack | `managed/skills/tron-{design,motion,native,imagery}/` (+ `managed/hooks/{cursor,github}/`) | `installTronDesignStack()` syncs each skill fresh into `~/.agents/skills/<name>/` + symlinks into `~/.claude/skills/`, `~/.cursor/skills/`, `~/.github/skills/` (copy fallback). `installTronDesignHooks()` merges the detector hook into consumer `.cursor/hooks.json` + `.github/hooks/tron-design.json`, keeping existing hooks and migrating the legacy launcher path. The engine runs only through `tron-design/scripts/tron-design` (telemetry and self-update off, agent-facing output rebranded); the `darwin-arm64` binary is vendored under `scripts/bin/`, other platforms download the pinned binary on first run |
| tron-design-fallback | `managed/skills/tron-design-fallback/` (`SKILL.md` + `references/stacks/*.md`) | `installTronDesignFallback()` → `~/.claude/skills/tron-design-fallback/` + `~/.cursor/skills/tron-design-fallback/` (always synced, overwritten) |
| Legacy design cleanup | — | `removeLegacyDesignSkills()` deletes `ui-ux-pro-max`, `frontend-design` and the 27 retired design skill names from `~/.{claude,cursor,agents,github}/skills/` (symlinks unlinked, not followed) and calls `disablePlugin('frontend-design@claude-plugins-official')` from `scripts/lib/install-tron-kit.js` (`claude plugin disable --scope <scope>` when installed + enabled; settings.json `enabledPlugins[...] = false` fallback) |
| frontend-skills rule | `managed/cursor/rules/frontend-skills.mdc` | `installFrontendSkillsRule()` → `~/.cursor/rules/frontend-skills.mdc` (always synced) |

To add or update a design skill, edit the source under `managed/skills/{tron-design,tron-motion,tron-native,tron-imagery,tron-design-fallback}/`, keep the install function in `postinstall.js` in sync, and bump the version (`minor` for a new skill). The stack references in `tron-design-fallback/references/stacks/` are hand-maintained (High-severity rules only); keep them terse.

---

## File structure

```
tron-claude-config/
├── package.json
├── scripts/
│   ├── postinstall.js                 # install orchestrator
│   ├── sync-tron-rules.js             # CLI wrapper for tron-kit rules sync
│   └── lib/
│       ├── detect-project-scope.js    # package.json + markers → folder list
│       ├── install-tron-rules.js      # copy bundled rules, prune, write .tron-scope.json
│       ├── install-tron-kit.js        # ~/.claude/tron-kit + claude plugin install, legacy cleanup
│       ├── ensure-tron-graph.js       # code graph MCP (Win + Unix), registered as tron-graph
│       └── ensure-tron-docs.js        # docs MCP, registered as tron-docs
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh        # also re-syncs tron-kit rules on auto-update
│   ├── tron-kit/                      # tron-kit plugin (21 stack skills, commands, hooks, rules) → ~/.claude/tron-kit/
│   ├── agents/                        # 12 tron agents, roster.json, guard
│   ├── cursor/rules/                  # frontend-skills.mdc → ~/.cursor/rules/
│   ├── hooks/                         # cursor/ + github/ tron-design hook templates
│   ├── claude/
│   │   ├── settings.json
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh        # commit token + PR titles/size gate
│   │   │   └── bootstrap-check.sh     # tools + daily update
│   │   └── rules/
│   │       ├── harness-enforcement.md
│   │       ├── agent-isolation.md
│   │       ├── harness-patterns.md
│   │       ├── agent-roster.md
│   │       ├── terse.md                # always-on communication
│   │       └── engineering-principles.md # always-on behavior
│   ├── git-hooks/
│   │   ├── pre-commit
│   │   └── pre-push
│   └── skills/
│       ├── commit-changes/SKILL.md    # → ~/.claude/commands/commit-changes.md
│       ├── code-review/SKILL.md       # → ~/.claude/commands/code-review.md
│       ├── security-review/SKILL.md   # → ~/.claude/commands/security-review.md
│       ├── make-pr/SKILL.md           # → ~/.claude/commands/make-pr.md
│       ├── tron-design/               # design authority + engine wrapper → ~/.agents/skills/ (+ symlinks, hooks)
│       ├── tron-motion/               # motion craft → ~/.agents/skills/ (+ symlinks)
│       ├── tron-native/               # native craft → ~/.agents/skills/ (+ symlinks)
│       ├── tron-imagery/              # comps, image-to-code, brand kits → ~/.agents/skills/ (+ symlinks)
│       └── tron-design-fallback/      # → ~/.claude + ~/.cursor skills (subordinate)
├── upstream/                          # MAINTAINER ONLY — never published (package.json `files`)
│   ├── sources.json                   # provenance + pins for every upstream we interpret
│   ├── watch.js                       # relevant-change tracker → reports/
│   ├── originality.js                 # ownership gate: no upstream prose or names in rewrites
│   ├── lib/                           # sources registry + git mirror helpers
│   └── reports/                       # upstream reports (committed)
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
| `~/.claude/commands/commit-changes.md` | **Package** (always synced; edits saved to `.bak` once) | Must run `/security-review` + `/code-review` before token |
| `~/.claude/commands/code-review.md` | **Package** (always synced; edits saved to `.bak` once) | Required by `/commit-changes` |
| `~/.claude/commands/security-review.md` | **Package** (always synced; edits saved to `.bak` once) | Required by `/commit-changes` |
| `~/.claude/commands/make-pr.md` | **Package** (always synced) | PT-BR PR template + 25-file split rule |
| `~/.claude/tron/installed.json` | **Package** (rewritten each install) | Hash ledger of every home-level file the package wrote; drives stale-file removal on upgrade |
| `~/.agents/skills/tron-{design,motion,native,imagery}/` + `~/.claude`, `~/.cursor`, `~/.github` symlinks (+ repo hooks) | **Package** (always synced) | tron design stack = primary DESIGN authority; darwin-arm64 engine in-tree, others fetch on first run |
| `~/.claude` + `~/.cursor/skills/tron-design-fallback/` | **Package** (always synced) | Subordinate to the stack |
| `~/.{claude,cursor,agents,github}/skills/` legacy + retired design skills | **Package** (removed if present) | Legacy design layer and the 27 names the stack replaced; plugin `frontend-design@claude-plugins-official` disabled |
| `~/.cursor/rules/frontend-skills.mdc` | **Package** (always synced) | Encodes the design authority order |
| `~/.claude/tron-kit/` + plugin `tron-kit@tron` | **Package** (always synced) | Version stamped from `package.json`; installed via `claude plugin`, settings.json fallback |
| `~/.claude/rules/{terse,engineering-principles}.md` | **Package** (always overwrite) | Core rules — mandatory every session |
| MCP configs (`tron-graph`, `tron-docs`) | **Package** (ensure on install) | Required MCP — setup script warns if missing; postinstall no longer aborts |
| `.claude/PR-TEMPLATE.md` | **Package** | Canonical PT-BR PR body scaffold |
| `.claude/hooks/lib/pr-template-validate.cjs` | **Package** | PR body + `gh pr create` command validation |
| `.claude/.pr-body-draft.md` | **Ephemeral** (gitignored) | Written by `/make-pr`, validated by hook |
| `.claude/.commit-authorized` | **Ephemeral** (gitignored) | One-shot commit token |
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

When editing `managed/skills/commit-changes/SKILL.md`, keep that order. When editing PR section titles, keep `PR-TEMPLATE.md`, `make-pr/SKILL.md` and `REQUIRED_SECTIONS` in `hooks/lib/pr-template-validate.cjs` in sync; the 25-file cap is `MAX_CHANGED_FILES` there.

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
2. Compare installed git SHA to remote HEAD (`hooks/lib/harness-sha.cjs`: npm `_resolved`, package `.git`, or the pnpm/bun/yarn lockfile)  
3. If outdated: `<pm> update @tron/claude-config` (re-resolves the git spec), then `postinstall.js` (pnpm/bun block dependency scripts), then `setup-claude-harness.sh --silent` (hooks + **tron-kit rules re-sync**)  
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

## Adding a new global skill or command

1. Add `managed/skills/<name>/` (`SKILL.md` plus any code files)  
2. Register it in `postinstall.js`: a command goes in `COMMANDS`, a skill directory in `HOME_SKILLS` (list its files; per-person `config.json`/`data/` stay out)  
3. Every file goes through `syncHomeFile`, which records it in `~/.claude/tron/installed.json`  
4. Document in README + HARNESS-GUIDE + this table  
5. `npm version minor` + push  

## Retiring a file

- **Home-level file** synced through `syncHomeFile`: delete it from `managed/` and from its list. The next install removes it from every machine (kept and reported if the user edited it).  
- **Consumer-repo file** (`MANAGED_FILES`): move its destination to `RETIRED_CONSUMER_FILES`.  
- **Directory trees** (design stack, tron-kit, fallback) are replaced wholesale on every install — nothing to do.  

## Changing tron-kit scope detection

1. Edit `scripts/lib/detect-project-scope.js`  
2. Dry-run: `node scripts/sync-tron-rules.js /path/to/consumer --dry-run`  
3. Confirm prune behavior for folders that leave scope  
4. Patch/minor bump as appropriate  

---

## tron-kit

`managed/tron-kit/` is tron's own Claude Code plugin. Consumers never fetch anything: postinstall copies it to `~/.claude/tron-kit/`, stamps `.claude-plugin/plugin.json` + the `marketplace.json` entry with this package's `version` (so `claude plugin update` sees each release), and installs `tron-kit@tron` at user scope.

| Part | Path | Notes |
|---|---|---|
| Stack skills (21) | `skills/tron-*/` | `SKILL.md` is a short router (scope, non-negotiables, reference table); depth lives in `reference/*.md`, loaded on demand. Agents list them in `managed/agents/tron/*.md` |
| Commands | `commands/{build-fix,test-coverage,refactor-clean}.md` | |
| Quality hooks | `hooks/hooks.json` → `scripts/hooks/run.js <id>` | `pre:config-guard`, `pre:bash:no-verify`, `post:edit-tracker`, `stop:checks`. Profiles: `TRON_HOOK_PROFILE` (minimal / standard / strict), `TRON_DISABLED_HOOKS` (comma-separated ids), `TRON_ALLOW_CONFIG_EDITS=1` lifts the config guard. Pre hooks answer `{}` under Cursor payloads. Tests: `node --test scripts/lib/tron-kit-hooks.test.js` |
| Language rules | `rules/<folder>/` | Synced into consumer `.claude/rules/tron/` by scope (`scripts/lib/detect-project-scope.js`); keep each file's `paths:` frontmatter and keep them short — they load into every session |
| MCP | `.mcp.json` | Chrome DevTools MCP |

To change a skill, edit it in place; adding or renaming a skill means updating the agent skill lists and the `map` of the `tron-kit` entry in `upstream/sources.json`. After any change: `claude plugin validate managed/tron-kit`, `npm run upstream:originality -- tron-kit`, then release with a `minor` bump.

---

## Upstream ownership

Everything this package ships is a **tron interpretation** of an upstream. Shipped content never names or links upstreams; provenance lives only in `upstream/` (excluded from the npm package by the `files` allowlist, together with this file and the maintainer scripts).

- `upstream/sources.json` — one entry per upstream: `repo`, pinned `ref`, `license`, `kind` (content / runtime), `status` (vendored → rewritten; runtime: wrapped → replaced), `phase`, the tron artifact it feeds, `watch` (paths we consume; `map` pairs upstream dirs to renamed tron skills) and `discover` (dirs where new upstream items appear).
- `npm run upstream:watch [-- <id>...]` — mirrors each repo (blobless, cached in `upstream/.cache/`), diffs pinned → upstream HEAD restricted to the watched paths, lists commits touching them and new upstream items not adopted, and writes `upstream/reports/<date>-<id>.md`. Sources with nothing relevant just report "nothing relevant".
- Porting: read the report, **re-express** relevant changes in the tron artifact in our own words (no verbatim copies), then `npm run upstream:watch -- --accept <id> [--ref <sha>]` to move the pin.
- `npm run upstream:originality [-- <id>...]` — the ownership gate. For each source with an `originality` block it compares the tron files' prose (code stripped) against the upstream files at the pin using 8-word runs, and scans them for upstream names (`brandTerms`); engine-owned literals (`.impeccable/` state paths, `IMPECCABLE_*` env names) are exempt. Exit 1 on any hit — run it after every port and before every release.
- Runtime tools are wrapped behind tron names until replaced: code graph → `tron-graph`, docs → `tron-docs` (MCP keys renamed on install), design engine → `tron-design/scripts/tron-design` (the engine's own launcher and binary stay untouched next to it; the wrapper refuses `update`/`install`, disables telemetry and rebrands agent-facing output).
- Licenses: notices stay only with still-vendored code (the wrapped design engine ships `scripts/ENGINE-LICENSE`) until it is replaced; a rewritten artifact carries no upstream text, so no notice is needed.

Ownership phases: 1) foundation — tracker, provenance, wrappers, core rules (done); 2) design stack → tron-design (done: content rewritten, engine wrapped); 3) tron-kit → own skills, rules, commands and hooks (done: 71 upstream skills consolidated into 21); 4) tron-flow replaces the workflow engine.

---

## Testing before release

```bash
# Syntax
node --check scripts/postinstall.js
node --check scripts/lib/detect-project-scope.js
node --check scripts/lib/install-tron-rules.js
node --check scripts/lib/install-tron-kit.js
node --check upstream/watch.js
node --check upstream/originality.js
npm run upstream:originality
node --check scripts/lib/ensure-tron-graph.js
node --check scripts/lib/ensure-tron-docs.js
node scripts/lib/pr-template-validate.test.js
node --test scripts/lib/tron-kit-hooks.test.js

# tron-graph / tron-docs registration (no changes written)
node scripts/lib/ensure-tron-graph.js --dry-run
node scripts/lib/ensure-tron-docs.js --dry-run

# Package contents (upstream/, MAINTAINER.md and maintainer scripts must be absent)
npm pack --dry-run

# Scope detection (no network)
node -e "console.log(require('./scripts/lib/detect-project-scope').detectProjectScope('.'))"

# tron-kit rules dry-run (bundled rules, no network)
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
- [ ] `~/.claude/.mcp.json` has a `tron-graph` server (or CI skipped machine installs)  
- [ ] `~/.claude/rules/{terse,engineering-principles}.md` present after install  

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
