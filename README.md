<p align="center">
  <img src="docs/cover.svg" alt="Exonous — the mind outside your head, for coding agents" width="100%">
</p>

# Exonous

*Exonous*, from Greek ἔξω (*exo*, "outside") + νοῦς (*nous*, "mind"): the mind outside your head.

Exonous is installed once per machine and active in every project of every supported AI coding tool. It gives agents shared rules, a delivery workflow, anchored memory in your Obsidian vault, and gates on commits, risky pushes and PRs. It writes nothing into your repositories.

The machine runtime is written in Rust. Installation registers absolute native hook commands; rules, agent contracts and vault formats stay shared across tools. The previous npm runtime remains available for existing installations under [Legacy repo mode](#legacy-repo-mode).

## Install

On macOS, Linux or WSL:

```bash
curl -fsSL https://raw.githubusercontent.com/zaqueu-1/exonous/main/install.sh | sh
```

On Windows, in PowerShell:

```powershell
& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/zaqueu-1/exonous/main/install.ps1).Content))
```

The command selects the latest stable release for macOS ARM64/x64, Linux ARM64/x64 or Windows x64, verifies its checksum and archive, and installs the native CLI with its assets. Node and Rust are unnecessary. Install is safe to re-run; it preserves personal settings, foreign launchers and vault notes. Git is used for subsequent release checks and repository commands.

The installer prepares `~/.local/bin/exonous` (`exonous.cmd` on Windows). Add `~/.local/bin` to PATH and restart the terminal, then run `exonous doctor`. Registered hooks and skills already use the installed executable's absolute path.

Choose tools or try a dry run by passing installer arguments:

```bash
curl -fsSL https://raw.githubusercontent.com/zaqueu-1/exonous/main/install.sh | sh -s -- --tools codex,cursor --dry-run
```

```powershell
& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/zaqueu-1/exonous/main/install.ps1).Content)) --tools 'codex,cursor' --dry-run
```

Use `EXONOUS_HOME=<temporary-directory>` for an isolated trial. Developers can [build from source](#native-rust-runtime) with Rust 1.88+; add `--real-home` to `exonous install` when intentionally installing from a development checkout.

Install also picks the vault agents write notes to, so there is nothing to configure:

- It reads Obsidian's vault registry (macOS, Linux incl. Flatpak and Snap, Windows, and the Windows side from WSL). Selection is deterministic: an existing custom configuration wins, then an open or most recently used vault. Use `vault set` to choose another.
- Without Obsidian it creates `~/Documents/exonous-vault` (`~/exonous-vault` if there is no `Documents`): a plain markdown folder with standard links. Opening it in Obsidian later is enough to switch to `[[wikilinks]]`. Uninstall never deletes it.
- An existing user/custom vault takes precedence over an old `exonous-vault` fallback. Install consolidates identifiable Exonous notes into the selected central root; unrelated personal files stay put and conflicts block the switch.

```bash
exonous vault detect                  # Obsidian registries searched and vaults found
exonous vault set ~/notes --create    # use another folder
exonous vault show                    # the vault in use and which setting chose it
exonous vault graph                   # write .exonous/graph.html + graph.json inside the vault
exonous vault consolidate ~/notes --dry-run # inspect owned-file moves and conflicts
exonous vault consolidate ~/notes --apply   # verify copies, switch config, remove verified originals
```

`.exonous/graph.html` is a self-contained offline force-directed view of notes, `[[wikilinks]]`, tags and file links (no CDN).

All current readers use `PROJECT_MEMORY_VAULT` before the unified `~/.claude/exonous/config.json` `vault` key. Old skill-local paths are consolidation inputs. Upgrade installed readers before consolidation; mixed old/new readers are unsupported. Handoff saves and reads never migrate or create vaults. Consolidation rejects symlinks, source aliases and differing destination files; a private journal resumes interrupted cleanup. Storage rollback must restore missing originals from verified central copies before repointing configuration.

The persisted root stays active until all copies verify and configuration switches. Canonical parent aliases such as macOS `/var` are resolved once; explicit symlink roots and symlinks inside a root are rejected. Shared legacy vaults contribute only identified handoffs and memory/session subtrees; attachments outside those subtrees and other unknown files remain listed as skipped, so cross-boundary links may need repair.

A known sessions source inside the selected root (such as `<vault>/sessoes`) may flatten into the central root after every destination is checked against all source roots. Targets inside sources, nested distinct sources and destinations that overlap sources are rejected.

### Automatic session memory (anamnesis)

Every session is recorded without asking, with no LLM and no API key, in Claude Code, Codex, Gemini CLI, Cursor, Copilot CLI, Windsurf and OpenCode:

1. **Capture**: lifecycle hooks record each prompt, tool name, file path and shell command, after a secret scrubber (API keys, tokens, JWTs, URL credentials, private keys, `*_KEY=`-style values) runs. Tool output is never stored. The raw log stays in `~/.claude/exonous/state/anamnesis/`.
2. **Consolidate**: at stop and session end, a rule-based page is written to `<vault>/<project>/sessions/<date>-<agent>-<id>.md` (prompts, files touched, tool counts, last commands, an abrupt-ending note) and a line is added to `sessions/log.md`.
3. **Handoff**: session end leaves one handoff (open questions, next steps, files touched). The next session in that repo, in any agent, receives it once.
4. **Brief**: at session start the agent gets the pending handoff, an unfinished session that was cut off, and the last 5 sessions. All of it is marked as recorded data, not instructions. Windsurf and OpenCode capture only, because they have no way to pass context back to the agent.

Sessions idle for 6 h are closed into pages automatically. Search them with `exonous project-memory search "<query>" --kind session`.

The storage format follows the vault. If the vault has `.obsidian/`, links are `[[wikilinks]]`. Otherwise it is a plain folder with standard `[text](file.md)` links. To turn it off, set `EXONOUS_MEMORY=0` or put `"memory": false` in `~/.claude/exonous/config.json`.

## The always-on rules

Nomos and Praxis include Ponytail's reuse-first and complete-scope discipline as always-on rules, without another skill or mode. Source and MIT attribution: [third-party notices](assets/THIRD-PARTY-NOTICES.md).

Two files bind every agent in every supported tool. Neither is invoked; both are already in force, and they ship wherever a tool reads rules from (`~/.claude/rules`, `AGENTS.md`, `GEMINI.md`, `nomos.mdc`/`praxis.mdc`, `global_rules.md`, OpenCode `instructions`, the Cline Rules dir, `QWEN.md`).

- **nomos** — the pillars and their order, terse communication, the engineering and context-economy rules, the verify gate, the git and PR gates, the agent roster.
- **praxis** — craft discipline per change, in order: make it work → make it right → keep the practice. One decision in one place, a failing test first, parse foreign data where it arrives, reproduce before fixing, restructure under pinned behavior, small ordered commits.

Precedence: a repo's `AGENTS.md`/`CLAUDE.md` wins over both; the scoped rules in `~/.claude/rules/exonous/` win on coding standards.

A static file at the top of a long session decays, so the **ethos** hook restates the set in one line on each prompt submit (Claude Code, Cursor, Gemini CLI, Codex CLI, Copilot). Windsurf and OpenCode only get the files, because neither can return context to the model on that event. Turn the reminder off with `EXONOUS_RULES_REMINDER=0` or `"rulesReminder": false` in `~/.claude/exonous/config.json`.

Install also retires rule files an older home install left in `~/.claude/rules` (they are always loaded and contradict nomos). A file is only retired when its content still matches what that install shipped, and a `.bak` copy is kept; one you edited is left alone and named by `exonous doctor`, along with your own rules.

## Platforms

| | Notes |
|---|---|
| macOS | ARM64 and x64 native bundle targets; local verification on ARM64 |
| Linux | ARM64 and x64 native bundle targets; `issue-board` uses Rust and `gh` |
| Windows (native) | x64 native target; the gate parses shell grammar. Before the design engine is cached, the batch launcher refuses expansion characters it cannot pass safely |
| WSL | Linux runtime; detects Windows-side Obsidian vaults |

CI defines native checks on Ubuntu, macOS and Windows and retains the compatibility suite on those platforms and WSL. The new remote jobs must pass before release; local checks alone do not establish cross-platform execution.

## Supported tools

| Tool | Gate | Rules | Commands | MCP | Update |
|---|---|---|---|---|---|
| Claude Code | hard | `~/.claude/rules` | commands, skills, agents | yes | `SessionStart` |
| Cursor | hard | `nomos.mdc` | skills (`/`) | yes | `sessionStart` |
| Gemini CLI | hard | `GEMINI.md` | skills + `.toml` commands | from Claude Code | `SessionStart` |
| Codex CLI | hard | `AGENTS.md` | skills (`$name`, `/skills`) | `config.toml` | `SessionStart` |
| OpenCode | hard | `instructions` | skills + commands, agents | from Claude Code | `session.created` |
| Windsurf | reduced | `global_rules.md` | skills (`/name`) | existing file | `pre_user_prompt` |
| Copilot | reduced | via `~/.claude` | skills (`/name`, `/skills list`) | no | `sessionStart` |
| Cline | none | Rules dir | no | no | no |
| Qwen Code | none | `QWEN.md` | no | no | no |
| Kiro | none | no | no | no | no |

- **Hard:** the tool's blocking hook is registered. **Reduced:** Windsurf writes only into config files that already exist and caps rules at 6000 chars; Copilot hooks are Preview.
- **Rules only, not gated:** Cline, Qwen Code, Kiro (Kiro is detect-only). They can commit without a token; install and doctor say so.
- **Unsupported:** Aider (doctor prints how to add `read:` by hand), Roo.
- **Codex:** approve the registered native commands in `/hooks`, including after their versioned paths change. Exonous never approves hooks for you. `doctor` checks registration and owned files; host approval and loading still need verification inside Codex.
- **Cursor:** User Rules live in its settings; paste `~/.claude/exonous/rules/nomos.md` and `praxis.md` there (after each release).
- MCP copied to other tools carries only command and arguments or an `https` URL, never headers or env, and nothing that looks like a credential.

## How the gates work

```
exonous workflow commit → /security-review → /code-review → exonous token commit → git commit
```

- `git commit` needs a one-shot token for exactly the tree staged at that moment (15 min). Staging at commit time (`-a`, `-p`, pathspecs) is refused. Staged changes are scanned with `gitleaks` when installed.
- `git push` is free on ordinary branches. A force-push or a push to `main`/`master` needs `exonous token push`; pushing every branch or deleting one is always refused.
- `gh pr create` needs the PR template's section titles and at most 30 changed files (`exonous template`, `exonous validate-pr <file>`).
- The gated command must run alone, optionally after one `cd <dir> &&`. A refusal names the next step; tools without commands get the procedure from `exonous workflow commit|pr`.
- Commits you make in your own terminal are not gated.

This is a speed bump for agents, not a sandbox. Not covered: scripts or build tools that run git or `gh` inside, commits from `merge`/`rebase`/`cherry-pick`, PRs opened via `curl`, the API or `gh` extensions, and an agent minting its own token.

## What's inside

Shared skills live in `~/.agents/skills`, with projections into supported tool directories. Gemini CLI and OpenCode also get commands. The versioned hook runtime, asset payload and ownership ledger live in `~/.claude/exonous`.

| Name | What it does | Use |
|---|---|---|
| **nomos** (νόμος), **praxis** (πρᾶξις) | the always-on rules: pillars and gates, craft discipline per change | automatic |
| **deliver** | classify → plan → execute → verify → close | `/deliver <request>` |
| **project-memory** | ADRs, plans, docs in the vault, anchored to code | via deliver, or `exonous project-memory search "…"` |
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
| **ethos** (ἦθος) | restates the always-on rules on each prompt | automatic |

Agents (`exo-*`, each fixed to a model tier): `pm`, `cto`, `researcher`, `designer`, `frontend`, `backend`, `mobile`, `data-ai`, `devops`, `infra`, `qa`, `security`. Every report starts with `{"status":"done|partial|blocked","cause":"…","risks":[…]}`.

Each senior specialist now has a compact inference contract: states, guarded transitions, domain implications, handoffs, skills and required evidence. For example, `rule resource request => authorize` binds authorization to resource access; `rule retry write => idempotent transaction` binds retry safety to writes. The profiles define their own grammar and guards, inherit Nomos/Praxis, and require an unfinished report when proof is missing. [Contract semantics](docs/AGENT-CONTRACTS.md) document the format. Model tiers and tool-specific agent projections are preserved.

## Native Rust runtime

The native executable implements installation, adapter settings and ownership, update checks and activation, doctor and gate self-tests, legacy repository migration, workflows, PR validation, one-use tokens, vault consolidation, handoff and all six lifecycle hooks. Project-memory, documentation lookup, board classification/rendering and the design-engine driver also run through Rust commands.

Build from a source checkout with Rust 1.88+ and git:

```bash
cargo build --release --locked
./target/release/exonous status --json
./target/release/exonous workflow commit
cargo test --locked
node native/tests/parity.cjs target/release/exonous
```

Native commands and hooks do not launch the Node CLI. Host-required plugin bridges, bundled browser/design engines and maintainer tooling retain their required runtimes; the weekly source reviewer uses Node. Existing npm entrypoints and helper files stay in the repository for compatibility. Installing the native version changes owned registrations; it does not silently replace an existing machine installation merely because the source was checked out. [Runtime boundaries, verification and rollback](docs/RUST-MIGRATION.md) describe the transition.

`node native/benchmark.cjs target/release/exonous` measures the `ethos` process with identical output. A local macOS ARM64 run with Node 24.14.1 and 30 samples measured median startup plus execution of 52.94 ms for Node and 6.80 ms for Rust. This measures a single local hook; LLM inference latency, token consumption and end-to-end task quality require separate evaluation. The rewritten profiles remain approximately the same byte size.

## Weekly source review

The maintainer workflow runs once per week, Mondays at 06:00 UTC, and can be started manually. It compares pinned sources against their current heads and sends bounded, private change evidence to a reviewer agent. The reviewer evaluates necessity, fit, implementation cost, risk and license compatibility with Exonous's deliberately simplified local tools. It records `adopt`, `defer` or `reject`; only `adopt` produces a proposed local implementation plan. Pins and local tools change only after implementation, checks and review.

The registry uses symbolic source IDs. Repository URLs, additional private scopes, the review gateway/model/key and the OpenVPN profile live in GitHub Secrets. The hosted runner connects to the private gateway through VPN before review. Published artifacts contain a sanitized summary and port manifest; source URLs, original paths, commit messages, patches, credentials and raw model replies stay out of those artifacts. Required license notices remain intact.

The source, reviewer and VPN secrets are configured in this repository. The Responses gateway passed a synthetic structured-output check locally, and the profile validator passed its compatibility tests. A real hosted VPN/reviewer run remains required after the workflow is published. [Setup, review policy and privacy boundaries](docs/SOURCE-REVIEW.md) describe the complete workflow.

## Updates

- At most daily, kairos starts `exonous update` in the background at session start in any gated tool.
- The native updater resolves the newest `vX.Y.Z` tag of the same major, fetches the platform bundle and `SHA256SUMS` over HTTPS, verifies the checksum, audits archive paths/types/size and validates metadata before running the candidate. Installation writes a versioned runtime and switches owned registrations transactionally. Selected tag provenance is recorded with activation; a moved accepted tag blocks an update.
- The next session shows one line. A new major is announced, never applied by itself.
- Branch/commit pins, development checkouts and legacy dependency ownership are preserved. An older native CLI forwards to a verified newer installation; lifecycle hooks already reference their installed version directly.

## Commands

| Command | Purpose |
|---|---|
| `exonous install` | wire every detected tool. Flags: `--tools a,b` `--all` `--skip-tool a,b` `--permissions` `--rewrite-jsonc` `--dry-run` `--quiet` |
| `exonous update [--check\|--major]` | update now, report only, or cross a major |
| `exonous vault [show\|detect\|set <path> [--create]\|graph\|consolidate [target] <--dry-run\|--apply>]` | choose one central root; consolidate verified owned files, preserving personal content; graph writes `.exonous/graph.html` + `graph.json` |
| `exonous doctor` | per-tool matrix (rules, gate, commands, MCP, update) and every check with its fix |
| `exonous gate --selftest <tool>` | pipe a fake `git commit` to the registered hook and expect a refusal |
| `exonous uninstall [--yes\|--dry-run]` | remove unchanged owned files and registrations; preserve user settings, vault, backups and edits |
| `exonous setup` | native alias of machine `install`; legacy npm repo setup is described below |
| `exonous migrate [--repo <dir>]` | move a repo-mode install to the global install and drop the devDependency |
| `exonous token <commit\|push>` | mint the one-shot token after review |
| `exonous workflow <commit\|pr>` | print the procedure |
| `exonous template`, `draft-path`, `validate-pr <file>` | PR template, draft location, body check |
| `exonous project-memory`, `doc`, `issue-board`, `ui-design` | native helpers used by their skills |

`--permissions` pre-approves only the read-only helpers (`workflow`, `template`, `draft-path`, `validate-pr`) in Claude Code. Doctor's gate self-test proves the script and wiring, not that the tool loads the hook; rows marked `⚠` are things it cannot verify.

## Legacy repo mode

Existing npm installations retain the previous repo-mode behavior below. The Rust `setup` command installs machine-wide; `migrate` verifies native gates before retiring recognized legacy files and removing a clean legacy dependency with lifecycle scripts disabled. Edited files and foreign hooks remain.

```bash
npm i -D github:zaqueu-1/exonous#v2.3.0     # or pnpm add -D / bun add -d
npx exonous setup
```

The package has no install scripts (a git install would run them in a temp clone), so add `"postinstall": "exonous setup"` to the repo's own `scripts` if `npm install` should do it for every teammate. Older repo hooks (v2.0.0 updater, tron-era `bootstrap-check.sh`) already call `setup` or `scripts/postinstall.js` after updating.

- **Global prevails:** when `~/.claude/exonous/install.json` points at a global copy, `setup` from a repo does nothing. A repo copy older than what the machine runs never downgrades it.
- **Updates:** the daily check follows the repo's dependency spec (its source and `#vX.Y.Z` ref, same major). It rewrites the ref in `package.json`, runs the repo's pm install with scripts disabled, then `setup` from the new copy. It skips while `package.json` or the lockfile has uncommitted changes; a spec pinned to a commit or a branch, or pointing anywhere but `zaqueu-1/exonous` or the `quanthubbr/tron-claude-config` mirror, is not updated. The bump shows up in `git status` for you to commit.
- **Old repo files:** files a v2.0.0 or tron-era install wrote into the repo would gate commits a second time, so `setup` removes the ones you did not edit (edited ones are kept and listed) once the machine gate is verified. The dependency stays.
- Native `exonous migrate` prepares the machine runtime before cleanup and drops the legacy devDependency only when package files are safe to change. It does not invoke a global npm install. `/tron-flow` stays an alias of `/deliver` for one release.

## Privacy and opt-outs

No telemetry. Native network use includes release tag lookup and verified bundle downloads; `issue-board fetch` uses authenticated GitHub requests. External engines and host plugins keep their own transport requirements. The weekly maintainer job fetches configured source repositories and sends bounded private evidence to the configured reviewer through VPN; see its privacy contract above. Legacy npm updates retain their package-manager behavior.

| Setting | Effect |
|---|---|
| `EXONOUS_NO_UPDATE=1`, `CI`, `~/.claude/exonous/config.json` `{"autoUpdate": false}` | no automatic updates |
| `EXONOUS_NO_INSTALL=1`, `{"autoInstall": false}` | `setup` from a repo copy installs nothing |
| `{"disabledTools": ["cline"]}` | tools a plain `exonous install` skips |
| `EXONOUS_RULES_REMINDER=0`, `{"rulesReminder": false}` | no rule reminder on prompt submit |
| `EXONOUS_HOME=<dir>` | read and write `<dir>` as the home (safe trials; skips global installs) |

## Maintainers

Releases, adapters, guards and upstream tracking: [docs/MAINTAINING.md](docs/MAINTAINING.md).
