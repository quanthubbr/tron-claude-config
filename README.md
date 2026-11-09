<p align="center">
  <img src="docs/cover.svg" alt="Exonous — the mind outside your head, for coding agents" width="100%">
</p>

# Exonous

Shared rules, delivery workflows, memory and commit gates for AI coding agents. Install once per machine; Exonous works across projects and writes nothing into your repositories.

## Install

With Node 18+, install the [official npm package](https://www.npmjs.com/package/exonous) globally:

```sh
npm install --global exonous@latest
exonous install
```

Or run it without a global npm installation:

```sh
npx exonous@latest
```

Exonous is a Node CLI on macOS, Linux, WSL and Windows; npm, pnpm and bun all work. It has no build step and no install lifecycle scripts. Git is needed for release checks and repository commands.

Choose tools or preview changes:

```sh
npx exonous install --tools 'claude,cursor,codex' --dry-run
```

Then check the result:

```sh
exonous doctor
```

Hooks run from `~/.claude/exonous/hooks` with your Node, so they keep working after the npm cache is cleared. Approve the registered commands in Codex `/hooks`; Exonous never approves them for you. Doctor checks registration and owned files; host loading and approval need verification inside the tool. Use `EXONOUS_HOME=<temporary-directory>` for an isolated trial.

**Coming from v2.10.4–v2.10.9 (Rust executable, `install.sh` or `install.ps1`):** while that version is still installed, run `exonous uninstall --yes`. It keeps your vault and personal settings. Then run the npm install above. The Rust updater cannot move itself to the Node package.

## What it adds

- **Nomos and Praxis:** shared engineering rules, source-first investigation and verification before completion.
- **Delivery:** `/deliver`, code/security review, commit and PR workflows, and twelve specialist agent roles.
- **Memory:** local session capture, searchable notes and handoffs in one Obsidian vault or plain Markdown folder. No LLM or API key is needed for capture.
- **Gates:** one-use review tokens for covered commits, pushes and PR creation. These are workflow checks, not a sandbox; scripts, alternate APIs and host permissions can bypass their coverage.

Claude Code, Cursor, Gemini CLI, Codex CLI and OpenCode support hard gates. Windsurf and Copilot have reduced gate coverage; Cline and Qwen receive rules. Kiro is detected without a rules installation. Aider requires manual configuration; Roo is unsupported.

Install selects an existing configured vault, then an open or recent Obsidian vault. Otherwise it creates `Documents/exonous-vault` or `exonous-vault` under your home. Uninstall preserves the vault and personal notes. Conflicting consolidation destinations block changes instead of overwriting content.

## Commands

| Command | Purpose |
|---|---|
| `exonous install [--tools a,b] [--dry-run]` | Install or refresh tool integrations |
| `exonous doctor` | Check registrations, owned files and gates |
| `exonous update [--check\|--major]` | Check or apply a verified update |
| `exonous uninstall --yes` | Remove unchanged owned files; preserve user content |
| `exonous vault detect` | Find available vaults |
| `exonous vault set ~/notes --create` | Choose one central vault |
| `exonous vault graph` | Generate an offline view of linked notes |
| `exonous project-memory search "query"` | Search project memory locally |
| `exonous gate --selftest claude` | Check a registered gate |
| `exonous workflow <commit\|pr>` | Read the review procedure |

`npx exonous <command>` runs the same CLI without a global install. `exonous pr create` validates the PR body against the template, runs `gh pr create` and saves the PR handoff. `project-memory`, `doc`, `issue-board` and `ui-design` run the engine of the installed skill. Daily update checks run at session start unless disabled and move to the newest release tag of the same major. New major versions require an explicit upgrade.

## Privacy and configuration

No telemetry. Session capture records prompts, tool names, file paths and commands after secret scrubbing; it never stores tool output. Network operations include npm release downloads, Git tag lookup and explicitly requested external integrations.

| Setting | Effect |
|---|---|
| `EXONOUS_HOME=<dir>` | Use an isolated home |
| `EXONOUS_NO_UPDATE=1` | Disable background updates |
| `EXONOUS_MEMORY=0` | Disable session memory |
| `EXONOUS_RULES_REMINDER=0` | Disable the per-prompt rules reminder |
| `~/.claude/exonous/config.json` | Configure vault, disabled tools and background behavior |

## Development and existing repository installs

From a checkout, with Node 18+:

```sh
EXONOUS_HOME="$(mktemp -d)" HOME="$(mktemp -d)" EXONOUS_NO_UPDATE=1 GIT_CONFIG_GLOBAL=/dev/null npm test
```

Install and uninstall from a checkout refuse the real home unless `EXONOUS_HOME` points elsewhere or `--real-home` is passed. Existing Git-based npm repository installs keep their legacy entrypoint. `exonous migrate` moves a repo-mode install to the global one and retires recognized repository files; edited files and foreign hooks remain.

[Agent contracts](docs/AGENT-CONTRACTS.md) · [Maintainer documentation](docs/MAINTAINING.md) · [Third-party notices](assets/THIRD-PARTY-NOTICES.md)
