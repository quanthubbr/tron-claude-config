<p align="center">
  <img src="docs/cover.svg" alt="Exonous — the mind outside your head, for coding agents" width="100%">
</p>

# Exonous

*Exonous*, from Greek ἔξω (*exo*, "outside") + νοῦς (*nous*, "mind"): the mind outside your head.

Exonous is installed once per machine and active in every project of every supported AI coding tool. It gives agents shared rules, a delivery workflow, anchored memory in your Obsidian vault, and gates on commits, risky pushes and PRs. It writes nothing into your repositories.

## Install

Needs Node 18+ and git.

```bash
npm i -g github:zaqueu-1/exonous#v2.1.2     # or: pnpm add -g … / bun add -g …
exonous install
```

`exonous install` is the contract and is safe to re-run. Installing the package runs none of its code (no install scripts), so always run `exonous install` after it.

Install also picks the vault agents write notes to, so there is nothing to configure:

- It reads Obsidian's vault registry (macOS, Linux incl. Flatpak and Snap, Windows, and the Windows side from WSL). One vault is used; with several, a terminal asks (default: the open or most recent one), otherwise the most recent wins.
- Without Obsidian it creates `~/Documents/exonous-vault` (`~/exonous-vault` if there is no `Documents`): plain markdown with `[[wikilinks]]` and an empty `.obsidian/`, so Obsidian can open it later. Uninstall never deletes it.
- A vault you already configured is kept.

```bash
exonous vault detect                  # Obsidian registries searched and vaults found
exonous vault set ~/notes --create    # use another folder
exonous vault show                    # the vault in use and which setting chose it
exonous vault graph                   # write .exonous/graph.html + graph.json inside the vault
```

`.exonous/graph.html` is a self-contained offline force-directed view of notes, `[[wikilinks]]`, tags and file links (no CDN).

Precedence: `PROJECT_MEMORY_VAULT` > the project-memory skill's `config.json` > `~/.claude/exonous/config.json` (`vault` key, written by install and `exonous vault set`).

## Platforms

| | Notes |
|---|---|
| macOS | full support |
| Linux | full support; `issue-board` needs Python 3 |
| Windows (native) | full support; the gate parses `sh`-grammar commands. The first `ui-design` run before the engine is cached refuses arguments containing `"` or `%` |
| WSL | full support; detects the Windows-side Obsidian vaults. |

CI runs the test suite on Ubuntu, macOS, Windows and WSL.

## Supported tools

| Tool | Gate | Rules | Commands | MCP | Update |
|---|---|---|---|---|---|
| Claude Code | hard | `~/.claude/rules` | commands, skills, agents | yes | `SessionStart` |
| Cursor | hard | `nomos.mdc` | skills | yes | `sessionStart` |
| Gemini CLI | hard | `GEMINI.md` | `.toml` commands | from Claude Code | `SessionStart` |
| Codex CLI | hard | `AGENTS.md` | `exonous workflow` | `config.toml` | `SessionStart` |
| OpenCode | hard | `instructions` | commands, agents | from Claude Code | `session.created` |
| Windsurf | reduced | `global_rules.md` | `exonous workflow` | existing file | `pre_user_prompt` |
| Copilot | reduced | via `~/.claude` | `exonous workflow` | no | `sessionStart` |
| Cline | none | Rules dir | no | no | no |
| Qwen Code | none | `QWEN.md` | no | no | no |
| Kiro | none | no | no | no | no |

- **Hard:** the tool's blocking hook is registered. **Reduced:** Windsurf writes only into config files that already exist and caps rules at 6000 chars; Copilot hooks are Preview.
- **Rules only, not gated:** Cline, Qwen Code, Kiro (Kiro is detect-only). They can commit without a token; install and doctor say so.
- **Unsupported:** Aider (doctor prints how to add `read:` by hand), Roo.
- **Codex:** approve the exonous hook in `/hooks`, or the gate stays pending.
- **Cursor:** User Rules live in its settings; paste `~/.claude/exonous/rules/nomos.md` there (after each release).
- MCP copied to other tools carries only command and arguments or an `https` URL, never headers or env, and nothing that looks like a credential.

## How the gates work

```
exonous workflow commit → /security-review → /code-review → exonous token commit → git commit
```

- `git commit` needs a one-shot token for exactly the tree staged at that moment (15 min). Staging at commit time (`-a`, `-p`, pathspecs) is refused. Staged changes are scanned with `gitleaks` when installed.
- `git push` is free on ordinary branches. A force-push or a push to `main`/`master` needs `exonous token push`; pushing every branch or deleting one is always refused.
- `gh pr create` needs the PR template's section titles and at most 25 changed files (`exonous template`, `exonous validate-pr <file>`).
- The gated command must run alone, optionally after one `cd <dir> &&`. A refusal names the next step; tools without commands get the procedure from `exonous workflow commit|pr`.
- Commits you make in your own terminal are not gated.

This is a speed bump for agents, not a sandbox. Not covered: scripts or build tools that run git or `gh` inside, commits from `merge`/`rebase`/`cherry-pick`, PRs opened via `curl`, the API or `gh` extensions, and an agent minting its own token.

## What's inside

Shared skills live in `~/.agents/skills`; the hook runtime in `~/.claude/exonous`.

| Name | What it does | Use |
|---|---|---|
| **nomos** (νόμος) | the single always-on rule, under 4.5 KB | automatic |
| **deliver** | classify → plan → execute → verify → close | `/deliver <request>` |
| **project-memory** | ADRs, plans, docs in the vault, anchored to code | via deliver, or `node ~/.claude/skills/project-memory/project-memory.mjs search "…"` |
| **commit-changes**, **make-pr** | the only way to commit and open a PR | `/commit-changes`, `/make-pr` |
| **code-review**, **security-review** | review local changes or a PR | `/code-review`, `/security-review` |
| **session-handoff**, **doc** | handoff notes; refresh stale vault docs | `/session-handoff`, `/doc` |
| **issue-board** | open GitHub Project issues, ranked | `/issue-board` |
| **ui-design**, **ui-motion**, **native-ui**, **ui-mockup**, **ui-patterns** | design direction, motion, native feel, mockups, charts/forms | `/ui-design <command>` |
| **atlas** (Ἄτλας), **biblos** (βίβλος) | code graph and live library docs (MCP) | `mcp__atlas__*`, `mcp__biblos__*` |
| **techne** (τέχνη) | stack skills, scoped language rules, quality hooks (Claude Code) | `techne:<stack>` |
| **taxis** (τάξις) | allows only the 12 `exo-*` agents and pins their model tiers (Claude Code, Cursor) | automatic |
| **pyle** (πύλη) | the commit, push and PR gate | automatic |
| **metron** (μέτρον) | nudges large whole-file reads toward locate-first (Claude Code) | automatic |
| **kairos** (καιρός) | shows the update note, starts the daily update | automatic |

Agents (`exo-*`, each fixed to a model tier): `pm`, `cto`, `researcher`, `designer`, `frontend`, `backend`, `mobile`, `data-ai`, `devops`, `infra`, `qa`, `security`. Every report starts with `{"status":"done|partial|blocked","cause":"…","risks":[…]}`.

## Updates

- At most daily, kairos starts `exonous update` in the background at session start in any gated tool.
- It picks the newest `vX.Y.Z` tag of the same major, resolves it to its commit, installs that commit with the package manager recorded at install, verifies it, then runs `exonous install --quiet`. Failures back off a day (`~/.claude/exonous/state/update.log`).
- The next session shows one line. A new major is announced, never applied by itself.
- Installs from a branch or commit are never auto-updated; `exonous doctor` warns if a release tag moved.

## Commands

| Command | Purpose |
|---|---|
| `exonous install` | wire every detected tool. Flags: `--tools a,b` `--all` `--skip-tool a,b` `--permissions` `--rewrite-jsonc` `--dry-run` `--quiet` |
| `exonous update [--check\|--major]` | update now, report only, or cross a major |
| `exonous vault [show\|detect\|set <path> [--create]\|graph]` | pick the vault agents keep notes in; `graph` writes `.exonous/graph.html` + `graph.json` inside the vault |
| `exonous doctor` | per-tool matrix (rules, gate, commands, MCP, update) and every check with its fix |
| `exonous gate --selftest <tool>` | pipe a fake `git commit` to the registered hook and expect a refusal |
| `exonous uninstall [--yes\|--dry-run\|--remove-package]` | remove what install wrote; keeps `config.json` and MCP registrations |
| `exonous migrate [--repo <dir>]` | move a repo-mode install to the machine install |
| `exonous token <commit\|push>` | mint the one-shot token after review |
| `exonous workflow <commit\|pr>` | print the procedure |
| `exonous template`, `draft-path`, `validate-pr <file>` | PR template, draft location, body check |

`--permissions` pre-approves only the read-only helpers (`workflow`, `template`, `draft-path`, `validate-pr`) in Claude Code. Doctor's gate self-test proves the script and wiring, not that the tool loads the hook; rows marked `⚠` are things it cannot verify.

## Migrating from repo installs

v2.0.0 and `@tron/claude-config` installed as a devDependency and wrote files into each repo. When such a copy installs or updates, it:

- runs the machine install and checks the gate hook is registered; if that fails, the repo is left untouched;
- removes only the files it wrote and that you did not edit (edited ones are kept and listed), and strips only exonous entries from hook configs;
- removes the devDependency when `package.json` and the lockfile have no other uncommitted changes, otherwise tells you to run `exonous migrate`.

Removed tracked files show up in `git status` for you to commit. `/tron-flow` stays an alias of `/deliver` for one release.

## Privacy and opt-outs

No telemetry. Network use: the daily `git ls-remote` against `github.com/zaqueu-1/exonous`, the package-manager install on update, and, on first install, a checksum-verified download of the atlas engine.

| Setting | Effect |
|---|---|
| `EXONOUS_NO_UPDATE=1`, `CI`, `~/.claude/exonous/config.json` `{"autoUpdate": false}` | no automatic updates |
| `EXONOUS_NO_INSTALL=1`, `{"autoInstall": false}` | no automatic repo migration |
| `{"disabledTools": ["cline"]}` | tools a plain `exonous install` skips |
| `EXONOUS_HOME=<dir>` | read and write `<dir>` as the home (safe trials; skips global installs) |

## Maintainers

Releases, adapters, guards and upstream tracking: [docs/MAINTAINING.md](docs/MAINTAINING.md).
