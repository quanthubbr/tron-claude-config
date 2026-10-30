# Maintaining Exonous

Everything a maintainer needs; the README is for users. Nothing in this file or in `maintainer/` is shipped (see `files` in `package.json`).

## Layout

| Path | Holds | Shipped |
|---|---|---|
| `bin/exonous.js` | CLI: `setup`, `update`, `doctor`, `uninstall` | yes |
| `src/setup.js` | the installer (repo gates first, then the machine toolkit) | yes |
| `src/update.js` | release-tag updater shared by the CLI and the `kairos` hook | yes |
| `src/doctor.js`, `src/uninstall.js` | health check, clean removal | yes |
| `src/lib/` | `home` (ledger), `rules` + `scope` (scoped coding rules), `techne`, `agents`, `atlas`, `biblos`, `eslint-ignore` | yes |
| `src/legacy/` | tron → exonous bridge — **delete one release after 2.0.0** (see below) | yes |
| `assets/rules/nomos.md` | the only always-on rule (byte budget enforced) | yes |
| `assets/agents/` | the 12 `exo-*` agents, `roster.json`, `taxis.js` | yes |
| `assets/skills/` | deliver, project-memory, commit-changes, make-pr, code-review, security-review, session-handoff, doc, issue-board, ui-design, ui-motion, native-ui, ui-mockup, ui-patterns | yes |
| `assets/techne/` | the `techne@exonous` Claude Code plugin (stack skills, quality hooks, language rules) | yes |
| `assets/repo/` | files copied into consumer repos (`AGENTS.md`, `.claude/`, git hooks) | yes |
| `assets/editors/` | Cursor rule, Cursor/Copilot ui-design hook templates | yes |
| `test/` | `npm test` | no |
| `maintainer/pege/` | upstream provenance, watch and originality gate | no |
| `maintainer/mirror-sync.sh` | manual push to the quanthub mirror | no |

## Release

```bash
npm test
npm run pege:originality
npm version patch            # minor: new skill/gate · major: renamed path consumers rely on
git push origin main --follow-tags
```

Consumers move only to `vX.Y.Z` tags. Within 24h, `kairos` (SessionStart) runs `exonous update` in the background: it rewrites the dependency to `#vX.Y.Z`, installs with the project's package manager, re-runs `setup`, and leaves a one-line note for the next session. A spec pinned to a commit or branch is never touched.

Rollback: `git revert`, then release a new patch. Never move or delete a published tag; consumers already resolved it.

## Common changes

- **New repo file:** add it under `assets/repo/` and to `REPO_FILES` in `src/setup.js`; wire hooks in `assets/repo/claude/settings.json`. Files dropped from `REPO_FILES` must also be removed from consumers, so add them to the leftover list of a legacy step.
- **New skill or command:** add `assets/skills/<name>/`, then register it in `HOME_SKILLS` (skill) or `COMMANDS` (gate command) in `src/setup.js`. Home files go through the ledger (`~/.claude/exonous/installed.json`), so a later release that drops a file removes it everywhere and keeps it if the user edited it.
- **New agent:** add `assets/agents/exo-<role>.md` with `model:` matching its tier, and add it to `roster.json` (`agents`, `tiers`). The report line `{"status":…}` is required.
- **techne:** edit in place. Adding or renaming a skill means updating agent skill lists and the `techne` entry in `maintainer/pege/sources.json`. Then run `claude plugin validate assets/techne`.
- **Scope detection:** edit `src/lib/scope.js`; preview with `node -e "require('./src/lib/rules').installRules('/path/to/repo', { dryRun: true })"`.

## Guards (`npm test`)

`test/consistency.test.js` fails when:
- an `exo-*` or `techne:*` name doesn't resolve;
- a file setup installs is missing;
- a skill's `name:` differs from its folder;
- the old brand shows up outside `src/legacy/`;
- `nomos.md` grows past 4.5 KB or techne `rules/common` past 4 KB.

Rules belong in skills or path-scoped rules, not in the core.

## Upstream ownership (`pege`)

Shipped content is our own text; provenance lives only in `maintainer/pege/sources.json` (repo, pinned ref, license, `local` artifact, `watch`/`discover` paths, `originality` block).

- `npm run pege:watch [-- <id>]` mirrors each upstream into `maintainer/pege/.cache/`, diffs pin → HEAD on the watched paths and writes `maintainer/pege/reports/<date>-<id>.md`.
- Port a change by re-expressing it in our words, then `npm run pege:watch -- --accept <id> [--ref <sha>]`.
- `npm run pege:originality [-- <id>]` fails on shared 8-word runs or upstream names (`brandTerms`). Run it after every port and before every release.
- The design engine stays vendored under `assets/skills/ui-design/scripts/` behind the `ui-design` wrapper (no telemetry, no self-update) with its `ENGINE-LICENSE`.

## The quanthub mirror

`quanthubbr/tron-claude-config` mirrors this repo and keeps its name, so quanthub consumers install from there. `.github/workflows/sync-from-upstream.yml` runs only on the mirror. Every day it fast-forwards `main` from `zaqueu-1/exonous` and pushes tags. If this repo is private, add an `UPSTREAM_TOKEN` secret on the mirror. To push manually: `bash maintainer/mirror-sync.sh` (`--check` for a dry run).

## Removing the bridge (release after 2.0.0)

1. Delete `src/legacy/` and `scripts/postinstall.js`; drop `scripts/postinstall.js` from `files`.
2. In `src/setup.js`, remove the `legacy` import and its two calls (`legacy.migrateRepo`, `legacy.migrateHome`). Make `createHome` read only the current ledger.
3. In `src/doctor.js`, drop the leftovers check.
4. In `src/update.js` and `assets/repo/claude/hooks/kairos.cjs`, drop the `@tron/claude-config` fallback.
5. In `test/consistency.test.js`, remove the legacy zones.
6. The `writeAliases` command files disappear from every machine on that release through the ledger.
