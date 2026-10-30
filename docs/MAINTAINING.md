# Maintaining Exonous

Everything a maintainer needs; the README is for users. Nothing in this file or in `maintainer/` is shipped (see `files` in `package.json`).

## Layout

| Path | Holds | Shipped |
|---|---|---|
| `bin/exonous.js` | CLI: `install` (`setup` alias), `update`, `doctor`, `uninstall`, `migrate`, `token`, `workflow`, `template`, `draft-path`, `validate-pr`, `gate --selftest`, `vault` | yes |
| `src/install.js` | the installer: shared pieces, one pass per selected adapter, then ledger prune | yes |
| `src/update.js` | thin wrapper over `assets/machine/hooks/lib/selfupdate.cjs`, shared by the CLI and the `kairos` hook | yes |
| `src/vault-cli.js` | `exonous vault show/detect/set/graph` and the install vault step (keep a configured vault, else a detected Obsidian vault, else the fallback) | yes |
| `src/lib/vault.js`, `vault-graph.js`, `vault-template.html` | Obsidian registry detection per platform (incl. WSL path translation), fallback vault, the `vault` key in `config.json`; wikilink graph and its offline HTML view | yes |
| `src/doctor.js`, `src/uninstall.js` | coverage matrix and checks, adapter-aware removal | yes |
| `src/adapters/` | one module per tool (`claude`, `cursor`, `gemini`, `codex`, `opencode`, `windsurf`, `copilot`, `cline`, `qwen`, `kiro`, `aider`), `index.js` registry and self-test, `shared.js` helpers | yes |
| `src/lib/` | `home` (ledger), `settings` (JSON hook/MCP merge), `writers/{markers,toml-block}`, `convert/`, `render-rules`, `runtime`, `paths`, `release`, `agents`, `atlas`, `biblos`, `techne` | yes |
| `src/repo-mode.js`, `assets/machine/hooks/lib/repo.cjs` | repo mode: machine install from `<repo>/node_modules`, global prevails, updates follow the repo spec; `scripts/postinstall.js` is its entry for older repo hooks (a plain file, never a lifecycle script) | yes |
| `src/legacy/repo-migrate.js` + `v2-manifest.json` | `exonous migrate` (repo → global) and the cleanup of old repo-install files — **delete in v3.0.0** | yes |
| `src/legacy/bridge.js` | tron → exonous home cleanup (`migrateHome`) — **lives one more release**, then delete | yes |
| `assets/rules/nomos.md` | the only always-on rule (byte budget enforced); `render-rules` derives the `no-agents` and `min` variants | yes |
| `assets/machine/` | what is copied to `~/.claude/exonous`: `hooks/` (`pyle.cjs`, `kairos.cjs`, `lib/*.cjs`, Node builtins only) and `PR-TEMPLATE.md`. Replaces the old `assets/repo/` | yes |
| `assets/agents/` | the 12 `exo-*` agents, `roster.json`, `taxis.js` | yes |
| `assets/skills/` | deliver, project-memory, commit-changes, make-pr, code-review, security-review, session-handoff, doc, issue-board, ui-design, ui-motion, native-ui, ui-mockup, ui-patterns | yes |
| `assets/techne/` | the `techne@exonous` Claude Code plugin (stack skills, quality hooks, language rules) | yes |
| `assets/adapters/`, `assets/editors/` | generated-file templates (OpenCode plugin), Cursor rule and hook templates | yes |
| `test/` | `npm test` | no |
| `maintainer/pege/` | upstream provenance, watch and originality gate | no |
| `maintainer/gen-v2-manifest.js` | regenerates `src/legacy/v2-manifest.json` from the `v2.0.0` tag | no |
| `maintainer/mirror-sync.sh` | run, check or update the quanthub mirror sync | no |

The hook runtime under `assets/machine/hooks/` must stay self-contained: it runs from `~/.claude/exonous/hooks`, never from the global package directory, and uses only Node builtins and its own `lib/`.

## Safety rules for contributors

Install and uninstall write into other tools' configs under the real home. Never run them against yours while developing.

- Redirect the home **on the same command line**, and turn updates off:
  `EXONOUS_HOME=$(mktemp -d) HOME=$(mktemp -d) EXONOUS_NO_UPDATE=1 node bin/exonous.js install --dry-run`
  `EXONOUS_HOME` moves everything exonous reads and writes; `HOME` also moves what child processes (`git`, package managers) read. With `EXONOUS_HOME` set, global package-manager calls, the `claude` CLI and the atlas engine install are skipped.
- A dev checkout (a `.git` next to `package.json`) refuses `install` and `uninstall` against the real home. `--real-home` overrides the guard; use it only on purpose.
- Tests and manual git runs use `GIT_CONFIG_GLOBAL=/dev/null` so your identity, hooks path and signing config do not leak in.
- `EXONOUS_TEST=1` plus a redirected home unlocks the test seams (`EXONOUS_RELEASE_SOURCE=file://…` for a local bare release repo, `EXONOUS_UPDATE_TEST_PM=1` for PATH shims of npm/pnpm/bun). Never set them outside a test.
- `config.json`, `agent-roles` and the skills' own config files are the user's: install and uninstall never overwrite or delete them.

- Platform and env are injected, never read ambiently: vault functions take `{ platform, env, fs, homedir, isWsl }`, and under `EXONOUS_HOME` the vault context points `APPDATA`, `XDG_CONFIG_HOME` and `USERPROFILE` at the temp home. A test must never read your real Obsidian registry.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`.

- **test:** Ubuntu, macOS and Windows on Node 20 and 22, plus Ubuntu on Node 18. Steps run in bash and call `node --test test/*.test.js` directly: `npm test` goes through cmd.exe on Windows, which leaves the glob unexpanded. `core.autocrlf` is off so checkouts keep LF.
- **wsl:** Ubuntu-24.04 under WSL on a Windows runner. It copies the repo to the Linux filesystem (`/mnt/*` has no POSIX modes) and exports the temp-home env itself, since Windows variables do not cross into WSL. It blocks like every other job.
- Both jobs set `EXONOUS_HOME`, `HOME`, `EXONOUS_NO_UPDATE=1` and a null `GIT_CONFIG_GLOBAL`, as in the safety rules above.

## Adding a tool adapter

1. Create `src/adapters/<id>.js` exporting:

   | Field | Meaning |
   |---|---|
   | `id` | lowercase tool id; also the ledger `tool` and the `--tools` value |
   | `tier` | `1` full, `2` reduced hard gate (also set `tierLabel: 'hard-reduced'`), `3` soft (`tierLabel: 'soft'`), `0` unsupported |
   | `gate` | `'hard'` only when the tool's blocking pre-exec hook is documented; `'soft'` for rules only; `'none'` for unsupported (detect + hint, never writes) |
   | `softNote` | optional; marks a tool that is only detected |
   | `detect()` | tool directory exists or binary on PATH; no writes. Called once for every adapter before anything is written |
   | `install(ctx)` | `ctx = { home, dryRun, log, execPath, permissions, external, detected, rewriteJsonc }`; may return `{ problems: [{ what, reason, fix }] }` for something that could not be activated |
   | `uninstall({ dryRun, log })` | strip hook and MCP entries the settings writers own; files and sections written through `home` are removed by the ledger pass |
   | `doctor()` | rows `{ name, ok, status, fix, level? }`; `level: 'warn'` for things exonous cannot verify |
   | `registeredCommand()` | the gate command found in the tool's config, or `null` (the plugin path for OpenCode) |
   | `selftestPayload(command, cwd)` | the tool's stdin shape for a shell call; or export `selftest()` when there is no command to pipe to (OpenCode) |

2. Register it in the `ADAPTERS` array of `src/adapters/index.js` (order is the order doctor prints).
3. Gate wiring: add the tool's payload shape and deny format to `assets/machine/hooks/lib/payload.cjs`, and its `--adapter` output format to `kairos.cjs` (`FORMATS`, or `SILENT` when stdout reaches nobody). Hook commands come from `hookCommand(execPath, 'pyle.cjs', 'auto --adapter <id>')`; the node binary is captured at install so hooks never depend on PATH.
4. Writers, so nothing the user owns is touched:
   - JSON hooks/MCP: `src/lib/settings.js` (`mergeOwned`/`stripOwned` keyed on the owned path marker `/.claude/exonous/hooks/`, `mergeKey`, `mergeList`, `mergeAllow`), and `mergeMcp`/`removeMcp` in `shared.js` for MCP maps (an entry the user changed is left alone). Atomic write, one `.exonous.bak`, invalid JSON aborts that file with a warning.
   - Text rules: `home.section(file, body, { tool })` writes a marked `exonous:start … exonous:end` span and leaves the rest byte-identical; a start without an end aborts the file. TOML: append-only block via `writers/toml-block.js`; never rewrite the user's TOML.
   - Whole files and links: `home.write|sync|link|copyTree(…, { tool: id })`.
5. Ledger tool ids: pass `{ tool: id }` on every `home` call. The ledger (`~/.claude/exonous/installed.json`) uses it so a prune or an install with `--tools` only touches the tools involved, and `install.json` records `tools: { id: { tier, version } }`.
6. Doctor columns are filled by matching row names: `rule|nomos` → Rules, `command|skills` → Commands, `MCP` → MCP, `kairos|self-update|pre_user_prompt` → Update. Name rows accordingly. Use `mcpRow`, `softRow` from `shared.js`.
7. Rules: choose the variant (`full`, `no-agents`, `min`). Any limit the tool has is checked at install time and reported as a `problem`, never silently truncated.
8. Tests (`test/adapter-<id>.test.js`; look at `adapter-codex.test.js`):
   - `require('./helpers/tmp-cleanup')` first, so every temp dir is removed when the process exits.
   - `useFixtureHome()` from `test/helpers/adapter-fixture.js`: temp `EXONOUS_HOME` and `HOME`, a PATH holding only `node`, updates off. Seed the tool's directory with pre-existing user content and assert it survives, idempotency, invalid-config abort and clean uninstall.
   - Feed `pyle.cjs --adapter <id>` the tool's fixture payload and check the deny format; add the payload to `test/payload.test.js`.
   - Check doctor rows and `selftest(adapter)`.
9. Update the README tool table and the tiers in this file's examples. Never claim a gate that was not verified against the tool's docs.

## Release

```bash
npm test
npm run pege:originality
bash maintainer/e2e-smoke.sh   # pack, global install into a temp prefix with a temp EXONOUS_HOME, install, doctor, selftests, commit denied then allowed, uninstall
npm version minor --no-git-tag-version   # patch: fix · minor: new tool, skill or gate · major: breaks the install contract
git commit -am "chore: release vX.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

Use an **annotated** tag. Installs and updates resolve the tag to its peeled commit and install `github:zaqueu-1/exonous#<commit>`; the commit is verified after install. Never move or delete a published tag: `exonous doctor` warns every consumer whose tag now points elsewhere.

Consumers move only to `vX.Y.Z` tags of the same major. Within 24 h, `kairos` (the session hook of any gated tool) runs `exonous update` in the background and leaves a one-line note for the next session. A major is announced and applied only by `exonous update --major`. A package installed from a commit or branch is never touched.

Rollback: `git revert`, then release a new patch.

Regenerate `src/legacy/v2-manifest.json` (`node maintainer/gen-v2-manifest.js`) only if the historical refs it hashes change; a rerun on an unchanged history leaves no diff.

## Common changes

- **New skill or command:** add `assets/skills/<name>/`, then register it in `HOME_SKILLS` (shared skill, lives in `~/.agents/skills` and is linked for Claude Code) or `COMMANDS` (gate command; each adapter converts it) in `src/lib/runtime.js`. Home files go through the ledger, so a later release that drops a file removes it everywhere and keeps it if the user edited it.
- **New agent:** add `assets/agents/exo-<role>.md` with `model:` matching its tier, and add it to `roster.json` (`agents`, `tiers`). The report line `{"status":…}` is required.
- **Gate behavior:** edit `assets/machine/hooks/pyle.cjs` and `lib/` (`shell.cjs` analysis, `cli-options.cjs`, `token.cjs`, `template.cjs`); extend `test/pyle.test.js`. Deny texts must name `exonous workflow …` so tools without commands still get the procedure.
- **techne:** edit in place. Adding or renaming a skill means updating agent skill lists and the `techne` entry in `maintainer/pege/sources.json`. Then run `claude plugin validate assets/techne`.
- **Stack rules:** `assets/techne/rules/<folder>/` is copied to `~/.claude/rules/exonous/<folder>/` for Claude Code; scoping comes from each rule's `paths:` frontmatter.

## Guards (`npm test`)

`test/consistency.test.js` fails when:
- an `exo-*` or `techne:*` name doesn't resolve;
- a file install ships is missing;
- a skill's `name:` differs from its folder;
- the old brand shows up outside `src/legacy/` and `maintainer/`;
- `package.json` gains an install lifecycle script (`preinstall`, `install`, `postinstall`, `prepare`, …): npm would then prepare a git install in a temp clone and run our code there, which breaks `npm i -g github:…`.
- `nomos.md` grows past 4.5 KB, techne `rules/common` past 4 KB, any rules variant is larger than `nomos.md`, or the `min` variant passes 3 KB (Windsurf).

Rules belong in skills or path-scoped rules, not in the core.

## Upstream ownership (`pege`)

Shipped content is our own text; provenance lives only in `maintainer/pege/sources.json` (repo, pinned ref, license, `local` artifact, `watch`/`discover` paths, `originality` block).

- `npm run pege:watch [-- <id>]` mirrors each upstream into `maintainer/pege/.cache/`, diffs pin → HEAD on the watched paths and writes `maintainer/pege/reports/<date>-<id>.md`.
- Port a change by re-expressing it in our words, then `npm run pege:watch -- --accept <id> [--ref <sha>]`.
- `npm run pege:originality [-- <id>]` fails on shared 8-word runs or upstream names (`brandTerms`). Run it after every port and before every release.
- The design engine stays vendored under `assets/skills/ui-design/scripts/` behind the `ui-design.mjs` wrapper (the `ui-design` sh script is a thin shim that execs it; no telemetry, no self-update) with its `ENGINE-LICENSE`.

## The quanthub mirror

`quanthubbr/tron-claude-config` mirrors this repo and keeps its name, so quanthub consumers install from there. `.github/workflows/sync-from-upstream.yml` runs only on the mirror. Every day it copies `main` and every missing `v*` release tag from `zaqueu-1/exonous` (repo-mode updates of `@tron/claude-config` read those tags).

GitHub never lets `GITHUB_TOKEN` push changes under `.github/workflows/`. So the mirror keeps its own workflows: each sync is a new commit with the upstream tree and the mirror's `.github/workflows`, never a fast-forward. No secret or admin setting is needed. The mirror's history is generated, so fix things here, never on the mirror.

- `bash maintainer/mirror-sync.sh` runs the sync now; `--check` diffs canonical `main` against the mirror, ignoring workflows.
- After changing `sync-from-upstream.yml` and merging it, run `bash maintainer/mirror-sync.sh --install-workflow` once. It needs push access and the gh `workflow` scope.

## Removing the bridge (v3.0.0)

`src/legacy/repo-migrate.js` and `v2-manifest.json` go in v3.0.0; `bridge.js` (`migrateHome`) lives one release longer than the repo migration is announced, then goes too.

1. Delete `src/legacy/repo-migrate.js`, `src/legacy/v2-manifest.json` and `maintainer/gen-v2-manifest.js`; drop the `migrate` command from `bin/exonous.js` and the `cleanRepoFiles` call from `src/repo-mode.js`. Repo mode itself stays.
2. Keep `setupDecision` and `scripts/postinstall.js`: repo mode needs them.
3. In `src/doctor.js`, drop the old-repo-files row from `machineChecks` and the leftovers check; in `src/install.js`, once `bridge.js` goes, remove the `legacy` import, its `migrateHome` call and `previous: legacy.previousLedger()`.
4. Delete `src/legacy/bridge.js`, `workflow-engine.js` and their tests; in `test/consistency.test.js`, remove the `LEGACY_ZONES` entries and `LEGACY_PACKAGE`.
5. The `/tron-flow` alias command files disappear from every machine on that release through the ledger.
