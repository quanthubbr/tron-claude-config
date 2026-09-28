# Claude Enforcement Harness — Practical Guide

> Quick reference: what the harness installs, what it enforces, and how to operate it day to day.  
> Consumer pitch + install story: [README.md](README.md) · Releases: [MAINTAINER.md](MAINTAINER.md)

**Current package version:** `1.9.0`

---

## What it does

### Files installed into every consumer repo

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Claude Code hooks — blocks direct `git commit` / `gh pr create`, runs bootstrap on every prompt |
| `.claude/hooks/bypass-check.sh` | Token gate (`.claude/.commit-authorized` / `.claude/.pr-authorized`). For `pr`, also requires all 5 PR section headers in `.claude/.pr-body-draft.md` |
| `.claude/hooks/bootstrap-check.sh` | Every prompt: tool warnings. Daily: silent package auto-update + re-run setup |
| `.claude/rules/tron/` | Scoped tron-kit coding rules (`common` + stack-matched folders) |
| `.claude/.tron-scope.json` | Last detected tron-kit scope (folders + signals) |
| `AGENTS.md` | Agent contract copied from the package |
| `.git/hooks/pre-commit` | Blocks terminal `git commit` without the commit token |
| `.git/hooks/pre-push` | Blocks direct push to `main`/`master`; prefers `/commit-changes` / `/make-pr` |
| `scripts/setup-claude-harness.sh` | Re-runnable setup (git hooks, tool check, tron-kit rules sync) |

`package.json` → `postinstall` runs the orchestrator on every `npm` / `bun` / `pnpm` install.

### What is enforced

| Gate | Rule |
|------|------|
| `/commit-changes` | Only official commit path. **Must** run `/security-review` then `/code-review` before creating the bypass token. Bundled (install-if-missing). |
| `/code-review` | Required quality gate. Bundled (install-if-missing). |
| `/security-review` | Required security gate. Bundled (install-if-missing). |
| `/make-pr` | Only official PR path. Bundled (install-if-missing). |
| PR body | `gh pr create` blocked unless `--body-file .claude/.pr-body-draft.md` with PT-BR headers (no inline `--body`, no `## Summary`) |
| Terminal `git commit` | Blocked by `pre-commit` without token |
| Push to `main`/`master` | Blocked by `pre-push` |
| Missing tools | `codebase-memory-mcp`: auto-ensure (hard fail on install/setup). `gsd`: warning in session |
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
| Emil Kowalski skills | `~/.agents/skills/<name>/` (symlinked → `~/.claude/skills/`, `~/.cursor/skills/`) | Vendored from `managed/skills/emilkowalski/`; **primary DESIGN authority** |
| Impeccable | `~/.claude/skills/impeccable/`, `~/.cursor/skills/impeccable/`, `~/.github/skills/impeccable/` (+ `impeccable-*` agents in `~/.claude/agents/`, `~/.cursor/agents/`) | Vendored from `managed/skills/impeccable/`; **primary DESIGN authority**; `darwin-arm64` binary in-tree, other platforms fetch checksum-verified binary on first run |
| Taste (leonxlnx) skills | `~/.agents/skills/<name>/` (symlinked → `~/.claude/skills/`, `~/.cursor/skills/`) | Vendored from `managed/skills/leonxlnx/`; **primary DESIGN authority** |
| tron-design-fallback | `~/.claude/skills/tron-design-fallback/`, `~/.cursor/skills/tron-design-fallback/` | Always synced (overwritten) from `managed/skills/tron-design-fallback/`; **subordinate** to the combo — charts, forms, web navigation, stack guidelines only |
| Legacy design cleanup | `~/.{claude,cursor,agents,github}/skills/{ui-ux-pro-max,frontend-design}` | Removed on every run if present (symlinks unlinked); `frontend-design@claude-plugins-official` plugin disabled via `claude plugin disable` (fallback: `enabledPlugins[...] = false` in `~/.claude/settings.json`) |
| frontend-skills rule | `~/.cursor/rules/frontend-skills.mdc` | Always synced from `managed/cursor/rules/`; encodes the design authority order |
| session-handoff | `~/.claude/skills/session-handoff/` | always synced (`SKILL.md`, `config.example.json`); `config.json` stays per person; session notes go to a central Obsidian vault set in `config.json` |
| issue-board | `~/.claude/skills/issue-board/` | always synced (`SKILL.md`, `board.mjs`, `render.py`, `config.example.json`); `config.json` and `data/` stay per person |
| gsd | global `$PATH` | `npm install -g @opengsd/gsd-pi` (or bun/pnpm) |
| doc | `~/.claude/skills/doc/` | always synced (`SKILL.md`, `doc.mjs`); no per-person state |
| caveman skill/plugin | `~/.claude/skills/caveman/` (or plugin) | Official install script |
| **Caveman rule (enforced)** | `~/.claude/rules/caveman.md` | Always overwritten from package — terse replies mandatory |
| codebase-memory-mcp | `~/.claude/.mcp.json` | **Required** — `ensure-codebase-memory.js` (official install.sh / install.ps1 + Unblock-File on Windows; npm fallback; postinstall exits 1 if missing) |

---

## codebase-memory-mcp (required)

Referenced by `AGENTS.md` / `agent-isolation.md` as the first layer of codebase navigation. The harness **must** leave it registered in `~/.claude/.mcp.json`.

| Step | Behavior |
|------|----------|
| Detect | Key containing `codebase-memory` in `~/.claude/.mcp.json` |
| macOS / Linux | Official `install.sh` via curl |
| Windows | Official `install.ps1` with `Unblock-File` + `ExecutionPolicy Bypass` |
| Retry | Up to 3 attempts |
| Fallback | `npm` / `pnpm` / `bun` global `codebase-memory-mcp` |
| Failure | `postinstall` → `process.exit(1)`; `setup-claude-harness.sh` → exit 1 |
| Repair | `npm run ensure:codebase-memory` |

Skipped only when `CI` / `GITHUB_ACTIONS` / `CONTINUOUS_INTEGRATION` is set.

---

## Frontend design skills (MAX DESIGN authority)

On ANY frontend/UI task, the harness enforces a two-level design stack (full contract in `managed/AGENTS.md`):

| Priority | Layer | Role |
|----------|-------|------|
| 1 | **Emil Kowalski + Impeccable + Taste** | **Maximum source of truth for DESIGN.** Emil = interaction/animation craft; Impeccable = direction, quality bar, hook-enforced edit discipline; Taste = high-end visual / landing / redesign direction |
| 2 | **tron-design-fallback** | **Subordinate** — consulted only *after* the combo sets direction, and only for charts/data viz, form UX, web navigation patterns, and stack guidelines (Vue, Nuxt, React, Next.js, React Native, shadcn/ui, Tailwind); includes a pre-delivery add-on |

**Conflict rule:** when tron-design-fallback disagrees with the Emil + Impeccable + Taste combo, **the combo always wins.**

**Announce on every UI task:** `Using Emil + Impeccable + Taste for [purpose]` — append `(+ tron-design-fallback)` only when it was consulted.

The former ui-ux-pro-max and frontend-design layer was removed (direction-setting data that competed with the combo, the rest already covered); postinstall deletes their leftover skill folders and disables the `frontend-design@claude-plugins-official` plugin.

### Where the skills are vendored and installed

| Skill set | Vendored under | Installed to |
|-----------|----------------|--------------|
| Emil Kowalski | `managed/skills/emilkowalski/` | `~/.agents/skills/<name>/`, symlinked into `~/.claude/skills/` and `~/.cursor/skills/` |
| Taste (leonxlnx) | `managed/skills/leonxlnx/` | `~/.agents/skills/<name>/`, symlinked into `~/.claude/skills/` and `~/.cursor/skills/` |
| Impeccable | `managed/skills/impeccable/` (+ `managed/agents/impeccable-*.md`, `managed/hooks/{cursor,github}/`) | `~/.claude/skills/impeccable/`, `~/.cursor/skills/impeccable/`, `~/.github/skills/impeccable/`; `impeccable-*` agents → `~/.claude/agents/` + `~/.cursor/agents/`; hooks → consumer `.cursor/hooks.json` + `.github/hooks/impeccable.json` |
| tron-design-fallback | `managed/skills/tron-design-fallback/` (`SKILL.md` + `references/stacks/*.md`) | `~/.claude/skills/tron-design-fallback/` + `~/.cursor/skills/tron-design-fallback/` (always synced) |
| frontend-skills rule | `managed/cursor/rules/frontend-skills.mdc` | `~/.cursor/rules/frontend-skills.mdc` (always synced) |

Emil and Taste land in `~/.agents/skills/` first, then symlink into the Claude and Cursor skill dirs (falling back to a copy when symlinks are unavailable). Impeccable is copied directly into all three tool dirs. Its engine ships as a vendored `darwin-arm64` binary under `scripts/bin/`; on other platforms the launcher downloads the pinned, checksum-verified binary on first run and caches it under `~/.impeccable/bin/<version>/`.

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
| **tron-kit rules** | `.claude/rules/tron/` | Highest for rules | Naming, testing, security, git |
| **Karpathy principles** | `~/.claude/rules/harness-enforcement.md` | Highest for behavior | Simplicity, surgical changes |
| **Harness skills** | `~/.claude/commands/*` | Workflow | Commit / PR gates |

**tron-kit wins on coding standards.** **Karpathy wins on how to approach the task.**

### Scoped tron-kit rules sync

`scripts/lib/detect-project-scope.js` + `scripts/lib/install-tron-rules.js`:

- Source: the bundled `managed/tron-kit/rules/` snapshot — no network
- Always install `common`
- Add language/framework folders only when the consumer stack matches
- Prune managed folders that fall out of scope on the next sync
- Triggered from `postinstall` and `setup-claude-harness.sh` (including after auto-update)

Manual re-sync:

```bash
node node_modules/@tron/claude-config/scripts/sync-tron-rules.js .
# dry-run:
node node_modules/@tron/claude-config/scripts/sync-tron-rules.js . --dry-run
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
- Syncs scoped tron-kit rules into `.claude/rules/tron/`  
- Copies `AGENTS.md`  
- Adds token/draft paths plus `.cursor/` and `.omc/` (local harness/session state) to `.gitignore`  
- On developer machines: installs skills, the `tron-kit@tron` Claude plugin (removing the legacy upstream plugin), Karpathy rules, gsd, caveman; **guarantees** codebase-memory-mcp (Win + macOS/Linux)  

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
├── package.json                              # v1.9.0
├── scripts/
│   ├── postinstall.js                        # orchestrator
│   ├── sync-tron-rules.js                    # tron-kit rules re-sync CLI
│   ├── sync-tron-kit.js                      # maintainer-only snapshot refresh
│   └── lib/
│       ├── detect-project-scope.js           # stack → tron-kit rule folders
│       ├── install-tron-rules.js             # copy / prune (local snapshot)
│       ├── install-tron-kit.js               # user-scope plugin + legacy cleanup
│       └── ensure-codebase-memory.js         # required MCP (Win + Unix)
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh
│   ├── tron-kit/                             # frozen tron-kit plugin snapshot
│   ├── tron-kit.config.json                  # snapshot pin, exclusions, rewrites
│   ├── agents/                               # impeccable-* subagents
│   ├── cursor/rules/frontend-skills.mdc      # design authority rule
│   ├── hooks/                                # cursor/ + github/ impeccable hook templates
│   ├── claude/
│   │   ├── settings.json
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh
│   │   │   └── bootstrap-check.sh
│   │   └── rules/
│   │       ├── harness-enforcement.md
│   │       ├── agent-isolation.md
│   │       ├── harness-patterns.md
│   │       └── caveman.md
│   ├── git-hooks/
│   │   ├── pre-commit
│   │   └── pre-push
│   └── skills/
│       ├── commit-changes/SKILL.md
│       ├── doc/{SKILL.md,doc.mjs}
│       ├── code-review/SKILL.md
│       ├── security-review/SKILL.md
│       ├── make-pr/SKILL.md
│       ├── emilkowalski/<name>/SKILL.md      # Emil — design authority
│       ├── impeccable/{SKILL.md,reference/,scripts/}  # Impeccable — design authority
│       ├── leonxlnx/<name>/SKILL.md          # Taste — design authority
│       ├── tron-design-fallback/{SKILL.md,references/stacks/}  # subordinate to the combo
│       ├── issue-board/{SKILL.md,board.mjs,render.py,config.example.json}
│       └── andrej-karpathy-skills/.../SKILL.md
├── docs/assets/                              # README visuals
├── HARNESS-GUIDE.md
├── MAINTAINER.md
└── README.md
```
