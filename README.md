<p align="center">
  <img src="docs/cover.svg" alt="Exonous — the mind outside your head, for coding agents" width="100%">
</p>

# Exonous

Shared rules, delivery workflows, memory and commit gates for AI coding agents. Install once per machine; Exonous works across projects and writes nothing into your repositories.

## Install

With Node 18+:

```sh
npx exonous
```

The command runs the packaged native executable and installs the detected tools. The npm package contains binaries for macOS ARM64/x64, Linux ARM64/x64 and Windows x64, plus shared assets. Installation requires no Rust compiler, build step or package lifecycle scripts.

Choose tools or preview changes:

```sh
npx exonous install --tools 'claude,cursor,codex' --dry-run
```

Without Node, on macOS, Linux or WSL:

```sh
curl -fsSL https://raw.githubusercontent.com/zaqueu-1/exonous/main/install.sh | sh
```

Without Node, in Windows PowerShell:

```powershell
& ([scriptblock]::Create((Invoke-WebRequest -UseBasicParsing https://raw.githubusercontent.com/zaqueu-1/exonous/main/install.ps1).Content))
```

These installers fetch the same npm package, verify its SHA-512 integrity, inspect its archive and confirm the executable version before installation. They preserve personal settings, foreign launchers and vault notes. Use `EXONOUS_HOME=<temporary-directory>` for an isolated trial.

Add `~/.local/bin` to PATH (`exonous.cmd` on Windows), restart your terminal, then run:

```sh
exonous doctor
```

Hooks and installed skills use an absolute native executable path, so they keep working after the npm cache or downloaded files are removed. Approve the registered native commands in Codex `/hooks`; Exonous never approves them for you. Doctor checks registration and owned files; host loading and approval need verification inside the tool.

**Upgrading from v2.10.3 or earlier:** reinstall once with `npx exonous@latest` or either installer above. Subsequent native updates use the verified npm package distribution. Git is needed for release checks and repository commands.

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

`npx exonous <command>` forwards explicit arguments to the native CLI. Daily update checks run at session start unless disabled. New major versions require an explicit upgrade.

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

Build the native CLI with Rust 1.88+:

```sh
cargo build --release --locked
./target/release/exonous install --real-home
cargo test --locked
```

Windows uses `target/release/exonous.exe`. Existing Git-based npm repository installs retain their legacy entrypoint. `exonous migrate` verifies the native installation before retiring recognized repository files; edited files and foreign hooks remain.

[Runtime boundaries and rollback](docs/RUST-MIGRATION.md) · [Agent contracts](docs/AGENT-CONTRACTS.md) · [Maintainer documentation](docs/MAINTAINING.md) · [Third-party notices](assets/THIRD-PARTY-NOTICES.md)
