# Claude Enforcement Harness — Practical Guide

> Quick reference: what the harness installs, what it enforces, and how to operate it day to day.  
> Consumer pitch + install story: [README.md](README.md) · Releases: [MAINTAINER.md](MAINTAINER.md)

**Current package version:** `1.15.2`

---

## What it does

### Files installed into every consumer repo

| File | Purpose |
|------|---------|
| `.claude/settings.json` | Claude Code hooks — gates `git commit` and `gh pr create`, runs bootstrap on every prompt |
| `.claude/hooks/bypass-check.sh` | `commit`: requires the one-shot token `.claude/.commit-authorized`. `pr`: body must contain the 5 template titles; PR capped at 25 changed files |
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
| `/commit-changes` | Only official commit path. **Must** run `/security-review` then `/code-review` before creating the bypass token. Bundled, synced on every install. |
| `/code-review` | Required quality gate. Bundled, synced on every install. |
| `/security-review` | Required security gate. Bundled, synced on every install. |
| `/make-pr` | Only official PR path. Bundled, synced on every install. |
| PR body | `gh pr create` blocked unless the body (`--body-file` or `--body`) contains the 5 titles of `.claude/PR-TEMPLATE.md` |
| PR size | `gh pr create` blocked above 25 changed files versus `--base` — split into smaller cohesive PRs |
| Code comments | Rule, not hook: business rules only, one terse line; comments over 2 lines in edited files get cut to one |
| Terminal `git commit` | Blocked by `pre-commit` without token |
| Push to `main`/`master` | Blocked by `pre-push` |
| Missing tools | `tron-graph`: auto-ensure (hard fail on setup). Workflow engine: warning in session |
| Outdated package | Silent auto-update, once per 24h |

### Machine-level installs (developers only — skipped in CI)

| Tool | Installed to | How |
|------|-------------|-----|
| `/commit-changes` | `~/.claude/commands/commit-changes.md` | Bundled, synced on every install |
| `/code-review` | `~/.claude/commands/code-review.md` | Bundled, synced on every install |
| `/security-review` | `~/.claude/commands/security-review.md` | Bundled, synced on every install |
| `/make-pr` | `~/.claude/commands/make-pr.md` | Bundled, synced on every install |
| Harness enforcement rule | `~/.claude/rules/harness-enforcement.md` | Copied from package |
| Agent isolation / harness patterns | `~/.claude/rules/` | Copied from package |
| tron design stack | `~/.agents/skills/tron-{design,motion,native,imagery}/` (symlinked → `~/.claude/skills/`, `~/.cursor/skills/`, `~/.github/skills/`) | Synced fresh from `managed/skills/tron-*/`; **primary DESIGN authority**; engine runs only via `tron-design/scripts/tron-design` (no telemetry, no self-update); `darwin-arm64` binary in-tree, other platforms fetch the pinned binary on first run |
| tron-design-fallback | `~/.claude/skills/tron-design-fallback/`, `~/.cursor/skills/tron-design-fallback/` | Always synced (overwritten) from `managed/skills/tron-design-fallback/`; **subordinate** to the stack — charts, forms, web navigation, stack guidelines only |
| Legacy design cleanup | `~/.{claude,cursor,agents,github}/skills/` — `ui-ux-pro-max`, `frontend-design` and the 27 skill names the stack replaced | Removed on every run if present (symlinks unlinked); `frontend-design@claude-plugins-official` plugin disabled via `claude plugin disable` (fallback: `enabledPlugins[...] = false` in `~/.claude/settings.json`) |
| frontend-skills rule | `~/.cursor/rules/frontend-skills.mdc` | Always synced from `managed/cursor/rules/`; encodes the design authority order |
| session-handoff | `~/.claude/skills/session-handoff/` | always synced (`SKILL.md`, `config.example.json`); `config.json` stays per person; session notes go to a central Obsidian vault set in `config.json` |
| issue-board | `~/.claude/skills/issue-board/` | always synced (`SKILL.md`, `board.mjs`, `render.py`, `config.example.json`); `config.json` and `data/` stay per person |
| Workflow engine | `~/.claude/`, `~/.cursor/` | `standard` profile; re-installed only when the runtime's profile marker is not `standard` (the profile survives engine updates) |
| **tron agents (enforced)** | `~/.claude/agents/tron-*.md`, `~/.cursor/agents/tron-*.md`; guard + roster + role briefs in `~/.claude/tron/` | Always synced from `managed/agents/`; guard hook registered in `~/.claude/settings.json` (`PreToolUse` Task\|Agent, `SessionStart`) and `~/.cursor/hooks.json` (`preToolUse` Task, `subagentStart`, `sessionStart`); other agent files are moved to `~/.claude/tron/agent-roles/` |
| agent-roster rule | `~/.claude/rules/agent-roster.md`, `~/.cursor/rules/agent-roster.mdc` | Always synced; roster table + orchestration protocol (security → architecture → model governance → quality → token economy → speed) |
| doc | `~/.claude/skills/doc/` | always synced (`SKILL.md`, `doc.mjs`); no per-person state |
| **Core rules (enforced)** | `~/.claude/rules/terse.md`, `~/.claude/rules/engineering-principles.md` | Always overwritten from package; retired predecessors removed |
| tron-graph | `~/.claude/.mcp.json`, `~/.claude.json`, `~/.cursor/mcp.json` | **Required** — `ensure-tron-graph.js` (platform installer + Unblock-File on Windows; npm fallback); registered under the `tron-graph` key |
| tron-docs | `~/.claude.json`, `~/.cursor/mcp.json` | `ensure-tron-docs.js` — registered under the `tron-docs` key; an existing docs entry is migrated with its headers |

---

## tron-graph (required)

Referenced by `AGENTS.md` / `agent-isolation.md` as the first layer of codebase navigation. The harness **must** leave it registered in `~/.claude/.mcp.json`.

| Step | Behavior |
|------|----------|
| Detect | `tron-graph` key in `~/.claude/.mcp.json` + engine binary present |
| Normalize | Engine's own MCP keys renamed to `tron-graph` in every MCP config |
| macOS / Linux | Engine `install.sh` via curl |
| Windows | Engine `install.ps1` with `Unblock-File` + `ExecutionPolicy Bypass` |
| Retry | Up to 3 attempts |
| Fallback | `npm` / `pnpm` / `bun` global engine package |
| Failure | `postinstall` → `process.exit(1)`; `setup-claude-harness.sh` → exit 1 |
| Repair | `npm run ensure:tron-graph` |

Skipped only when `CI` / `GITHUB_ACTIONS` / `CONTINUOUS_INTEGRATION` is set.

---

## Frontend design skills (MAX DESIGN authority)

On ANY frontend/UI task, the harness enforces a two-level design stack (full contract in `managed/AGENTS.md`):

| Priority | Layer | Role |
|----------|-------|------|
| 1 | **tron design stack** | **Maximum source of truth for DESIGN.** `tron-design` (always first) = direction, modes, critique/audit, refine, live iteration, style modules, hook-enforced detector; `tron-motion` = animation and interaction feel; `tron-native` = native platforms and Swift; `tron-imagery` = comps, image-to-code, brand kits |
| 2 | **tron-design-fallback** | **Subordinate** — consulted only *after* the stack sets direction, and only for charts/data viz, form UX, web navigation patterns, and stack guidelines (Vue, Nuxt, React, Next.js, React Native, shadcn/ui, Tailwind); includes a pre-delivery add-on |

**Conflict rule:** when tron-design-fallback disagrees with the tron design stack, **the stack always wins.**

**Announce on every UI task:** `Using tron-design for [purpose]` — name each companion skill actually loaded.

The former ui-ux-pro-max and frontend-design layer was removed (direction-setting data that competed with the stack, the rest already covered); postinstall deletes their leftover skill folders and disables the `frontend-design@claude-plugins-official` plugin.

### Where the skills are vendored and installed

| Skill set | Vendored under | Installed to |
|-----------|----------------|--------------|
| tron design stack | `managed/skills/tron-{design,motion,native,imagery}/` (+ `managed/hooks/{cursor,github}/`) | `~/.agents/skills/<name>/`, symlinked into `~/.claude/skills/`, `~/.cursor/skills/`, `~/.github/skills/`; hooks merged into consumer `.cursor/hooks.json` + `.github/hooks/tron-design.json` |
| tron-design-fallback | `managed/skills/tron-design-fallback/` (`SKILL.md` + `references/stacks/*.md`) | `~/.claude/skills/tron-design-fallback/` + `~/.cursor/skills/tron-design-fallback/` (always synced) |
| frontend-skills rule | `managed/cursor/rules/frontend-skills.mdc` | `~/.cursor/rules/frontend-skills.mdc` (always synced) |

The stack lands in `~/.agents/skills/` first (stale files removed on every sync), then symlinks into the Claude, Cursor and GitHub skill dirs (falling back to a copy when symlinks are unavailable). The design engine ships as a vendored `darwin-arm64` binary under `tron-design/scripts/bin/`; other platforms download the pinned binary on first run. Agents and hooks call it only through `scripts/tron-design`.

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
| **Engineering principles** | `~/.claude/rules/engineering-principles.md` | Highest for behavior | Simplicity, surgical changes |
| **Harness skills** | `~/.claude/commands/*` | Workflow | Commit / PR gates |

**tron-kit wins on coding standards.** **Engineering principles win on how to approach the task.**

### tron-kit quality hooks

Installed with the `tron-kit@tron` plugin. They guard Claude Code sessions; Cursor also runs plugin hooks but rejects their output format, so under Cursor payloads the pre hooks answer `{}` and Cursor sessions rely on the repo's git hooks (`pre-commit`, `pre-push`) and the always-on rules instead:

| Hook | When | Does |
|---|---|---|
| `pre:config-guard` | Write / Edit / MultiEdit | Blocks edits to existing lint/format configs and their ignore files (creating one is fine) |
| `pre:bash:no-verify` | Bash | Blocks git commands that skip hooks: the skip-verification flag, `git commit -n`, `core.hooksPath` overrides (`-c`, `--config-env`, `GIT_CONFIG_*`, `git config`) |
| `post:edit-tracker` | Edit / Write / MultiEdit | Records the files the session edited |
| `stop:checks` | Stop | Formats edited JS/TS (Biome or Prettier, local binaries only), runs `tsc --noEmit` per tsconfig, flags leftover `console.log` — advisory, never blocks |

Controls: `TRON_HOOK_PROFILE=minimal|standard|strict` (minimal turns them all off), `TRON_DISABLED_HOOKS=<id>,<id>`, `TRON_ALLOW_CONFIG_EDITS=1` when the user explicitly wants a config change.

### Scoped tron-kit rules sync

`scripts/lib/detect-project-scope.js` + `scripts/lib/install-tron-rules.js`:

- Source: the bundled `managed/tron-kit/rules/` — no network
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
- On developer machines: installs skills, the `tron-kit@tron` Claude plugin (removing the legacy plugin), core rules (terse, engineering principles), the workflow engine; registers `tron-graph` and `tron-docs` (Win + macOS/Linux)  

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

## Emergency bypass (humans only)

Agents never skip hooks: tron-kit refuses hook-skipping git commands, and an agent that hits a failing hook fixes the cause or stops and asks. If a person truly has to ship past a broken gate, they do it themselves in their own terminal, then fix the gate in a follow-up. Removing the harness from a repo means removing the dependency and its `.git/hooks/pre-commit` / `pre-push`, not editing them away.

---

## Package structure

```
tron-claude-config/
├── package.json                              # v1.15.2
├── scripts/
│   ├── postinstall.js                        # orchestrator
│   ├── sync-tron-rules.js                    # tron-kit rules re-sync CLI
│   └── lib/
│       ├── detect-project-scope.js           # stack → tron-kit rule folders
│       ├── install-tron-rules.js             # copy / prune (bundled rules)
│       ├── install-tron-kit.js               # user-scope plugin + legacy cleanup
│       ├── ensure-tron-graph.js              # required code graph MCP (Win + Unix)
│       └── ensure-tron-docs.js               # docs MCP registration
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh
│   ├── tron-kit/                             # tron-kit plugin (skills, commands, hooks, rules)
│   ├── agents/                               # 12 tron agents, roster, guard
│   ├── cursor/rules/frontend-skills.mdc      # design authority rule
│   ├── hooks/                                # cursor/ + github/ tron-design hook templates
│   ├── claude/
│   │   ├── settings.json
│   │   ├── hooks/
│   │   │   ├── bypass-check.sh
│   │   │   └── bootstrap-check.sh
│   │   └── rules/
│   │       ├── harness-enforcement.md
│   │       ├── agent-isolation.md
│   │       ├── harness-patterns.md
│   │       ├── agent-roster.md
│   │       ├── terse.md
│   │       └── engineering-principles.md
│   ├── git-hooks/
│   │   ├── pre-commit
│   │   └── pre-push
│   └── skills/
│       ├── commit-changes/SKILL.md
│       ├── doc/{SKILL.md,doc.mjs}
│       ├── code-review/SKILL.md
│       ├── security-review/SKILL.md
│       ├── make-pr/SKILL.md
│       ├── tron-design/{SKILL.md,reference/,scripts/}  # design authority + engine wrapper
│       ├── tron-motion/{SKILL.md,reference/}  # motion and interaction craft
│       ├── tron-native/{SKILL.md,reference/}  # native platform craft
│       ├── tron-imagery/{SKILL.md,reference/} # comps, image-to-code, brand kits
│       ├── tron-design-fallback/{SKILL.md,references/stacks/}  # subordinate to the stack
│       └── issue-board/{SKILL.md,board.mjs,render.py,config.example.json}
├── upstream/                                 # maintainer-only, not published
├── docs/assets/                              # README visuals
├── HARNESS-GUIDE.md
├── MAINTAINER.md
└── README.md
```
