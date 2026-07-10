<p align="center">
  <img src="docs/assets/harness-banner.svg" alt="@tron/claude-config — Enforcement harness for Claude Code" width="100%"/>
</p>

<p align="center">
  <strong>Stop hoping the AI follows the process. Make the process impossible to skip.</strong>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-1.6.1-0F766E?style=for-the-badge"/>
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D18-38BDF8?style=for-the-badge&logo=node.js&logoColor=white"/>
  <img alt="pm" src="https://img.shields.io/badge/npm%20%7C%20pnpm%20%7C%20bun-ready-A78BFA?style=for-the-badge"/>
  <img alt="license" src="https://img.shields.io/badge/private-Tron-1E293B?style=for-the-badge"/>
</p>

---

# @tron/claude-config

Drop one dependency into any repo. On `npm install`, Claude Code gets **hooks, git gates, scoped coding rules, and the official skills** (`/commit-changes`, `/code-review`, `/security-review`, `/make-pr`) — enforced by the filesystem, not by memory.

> **Hooks over vibes.** Reviews before commits. Complete PRs before merge. Rules matched to the project stack. Silent daily self-update.

---

## Why you should install this

| Without the harness | With the harness |
|---------------------|------------------|
| Anyone (or any model) can `git commit` raw | Only `/commit-changes` after **security + code review** |
| PRs that say “fix stuff” | Template with **5 mandatory sections** (PT-BR) |
| Rules copied by hand (or forgotten) | **ECC rules scoped** to Vue / React / TS / … automatically |
| “Did you update the package?” | **Auto-update** once per day, silent |
| Different process per repo | **One kit** across the company |

<p align="center">
  <img src="docs/assets/flow-commit.svg" alt="Commit flow: rules enforcement → security-review → code-review → git commit → push" width="100%"/>
</p>

---

## 60-second install

### 1. Add the dependency

```json
{
  "devDependencies": {
    "@tron/claude-config": "git+https://github.com/zaqueu-1/tron-claude-config.git"
  }
}
```

### 2. Install

```bash
npm install   # or: bun install / pnpm install
```

That’s it. `postinstall` wires the repo and (on developer machines) installs the global skills.

> Works with **npm, bun, and pnpm** — detected from your lockfile.

The harness lives under `.claude/` and `.git/hooks/`. It does **not** overwrite your `CLAUDE.md`, repo-local `.claude/commands/`, or `.claude/settings.local.json`.

---

## What you get

### In every consumer repo

```
your-project/
├── .claude/
│   ├── settings.json           ← Claude Code hooks
│   ├── rules/ecc/              ← ECC rules (common + stack-matched folders)
│   ├── .ecc-scope.json         ← last detected scope (audit trail)
│   └── hooks/
│       ├── bypass-check.sh     ← token + PR template gate
│       └── bootstrap-check.sh  ← tool check + daily auto-update
├── .git/hooks/
│   ├── pre-commit              ← blocks raw commits
│   └── pre-push                ← blocks raw push to main/master
├── AGENTS.md                   ← agent contract for this repo
└── scripts/setup-claude-harness.sh
```

### On the developer machine (install-if-missing)

| Command | Role |
|---------|------|
| `/commit-changes` | Official commit path — reviews → token → commit → push |
| `/code-review` | Quality / correctness gate (**required** before commit) |
| `/security-review` | Security checklist gate (**required** before commit) |
| `/make-pr` | Official PR path — PT-BR template + token |

Also installed: Karpathy guidelines skill + always-on enforcement rules under `~/.claude/rules/`.

Existing customized commands are **never overwritten**.

---

## How enforcement works

### Commit path

1. `/security-review` on the staged/branch diff → **BLOCK** on CRITICAL/HIGH  
2. `/code-review` on the same diff → **BLOCK** on CRITICAL/HIGH  
3. Create `.claude/.commit-authorized`  
4. `git commit` — hooks allow once, then delete the token  

Raw `git commit` in the terminal? **Blocked** by `pre-commit`.

### PR path

1. `/make-pr` writes `.claude/.pr-body-draft.md` with all 5 sections  
2. Creates `.claude/.pr-authorized`  
3. `gh pr create --body-file …` — hook validates token **and** headers  

Required sections: **Resumo**, **Principais mudanças**, **Arquitetura & implementação**, **Antes → Agora**, **Roteiro de teste**.  
If a section doesn’t apply, keep the header and use `_N/A — não aplicável a esta mudança_`.

### Scoped ECC rules

On install and on harness setup/update, the package:

1. Detects stack from `package.json` + project markers  
2. Clones [ECC](https://github.com/affaan-m/ECC) temporarily  
3. Syncs **only** matching folders into `.claude/rules/ecc/`  
4. Removes managed folders that no longer match  

Always: `common`. Conditionally: `typescript`, `vue`, `nuxt`, `react`, `react-native`, `web`, `csharp`, `python`, `golang`, and other ECC languages when detected.

### Session bootstrap

Every Claude prompt runs `bootstrap-check.sh`:

- Warns if `gsd` / `codebase-memory-mcp` are missing  
- Once per 24h, compares package SHA to remote and self-updates  

---

## Quality layers

| Layer | Where | Wins on |
|-------|--------|---------|
| **ECC rules** | `.claude/rules/ecc/` | Coding standards |
| **Karpathy principles** | `~/.claude/rules/harness-enforcement.md` | Behavior: simplicity, surgical edits |
| **Harness skills** | `~/.claude/commands/*` | Commit / PR workflow |

ECC > Karpathy on standards. Karpathy > ECC on how to approach the work.

---

## Emergency bypass

```bash
git commit --no-verify -m "emergency only"
git push --no-verify

# Tear down gates in one repo:
rm .git/hooks/pre-commit .git/hooks/pre-push
```

---

## Keep it fresh

Push to `main` in this repo. Consumers pick up changes on the next daily check — or immediately on `npm install`.

```bash
npm version patch|minor|major
git push origin main --follow-tags
```

Full maintainer playbook: **[MAINTAINER.md](MAINTAINER.md)** · Day-to-day reference: **[HARNESS-GUIDE.md](HARNESS-GUIDE.md)**

---

## Uninstall

```bash
rm .git/hooks/pre-commit .git/hooks/pre-push
npm uninstall @tron/claude-config
# optional: rm .claude/hooks/bypass-check.sh .claude/hooks/bootstrap-check.sh
```

---

## Package map

```
tron-claude-config/
├── package.json                 # v1.6.1 · postinstall entry
├── scripts/
│   ├── postinstall.js           # install orchestrator
│   ├── sync-ecc-rules.js        # manual ECC re-sync CLI
│   └── lib/
│       ├── detect-project-scope.js
│       └── install-ecc-rules.js
├── managed/
│   ├── AGENTS.md
│   ├── setup-claude-harness.sh
│   ├── claude/                  # settings, hooks, rules
│   ├── git-hooks/               # pre-commit, pre-push
│   └── skills/                  # commit-changes, code-review,
│                                # security-review, make-pr, karpathy
├── docs/assets/                 # README visuals
├── HARNESS-GUIDE.md
├── MAINTAINER.md
└── README.md
```

---

<p align="center">
  <em>One install. Company-wide process. Reviews you can’t skip.</em>
</p>
