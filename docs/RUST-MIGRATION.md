# Rust migration status

The native executable implements the machine control plane and first-party skill helpers in Rust. It does not launch the Node CLI. Native installation writes versioned executable and asset directories and registers absolute hook commands. Existing npm installations remain compatible until their owner explicitly installs the native version; checking out this source does not mutate a machine installation.

## Current boundary

| Behavior | Native status | Remaining proof |
| --- | --- | --- |
| Workflow printing | Implemented, embedded assets | Workflow text parity checked against Node |
| PR template lookup and body validation | Implemented | Broaden fixtures for every existing repository-template case before cutover |
| Draft paths | Implemented | Canonical repository identity and safe home ownership checked |
| Token creation and atomic consumption | Implemented in library; minting exposed in CLI | Concurrent native consumption, expiry, changed staged tree, unsafe permissions and native-to-Node one-use consumption checked; complete push/worktree parity before cutover |
| Hook payload normalization | Implemented for seven hosts and wired into Pyle | Host protocol and caller fixtures pass |
| Ethos prompt reminder | Implemented | Six-host output parity, configuration opt-out and Node-free CLI execution checked |
| Metron large-read advice | Implemented | Complete existing read-edge fixture parity before hook registration changes |
| Taxis spawn governance | Implemented, including Cursor top-level events, role briefs and SessionStart sweep | Native caller tests and spawn parity pass; collisions preserve every role brief |
| Install, setup, uninstall, doctor, adapter registration | Implemented for eleven adapter selections | Caller fixtures cover owned changes, foreign settings, JSONC/TOML, dry runs, retries, rollback and registry selection |
| Update and release distribution | Implemented | Offline actual-executable activation, SHA256 manifest, archive audit, transactional provenance and moved-tag checks pass; published remote release still pending |
| Pyle commit/push/PR enforcement | Implemented | Original runtime bypass corpus, scanner processes, real Git flag cancellation and implicit push configuration regressions pass |
| Kairos and Anamnesis | Implemented | Original memory caller corpus and native concurrent session/handoff fixtures pass |
| Vault, handoff, repository migration | Implemented | Discovery, schema, conflicts, symlinks, verified-copy recovery, worktrees and dependency cleanup tested |
| First-party skill helpers | Project-memory, doc, issue-board and design driver implemented | Original memory/doc caller corpus replayed against native executable; native board and engine-driver caller checks pass |
| Maintainer source review | Node, deliberately outside machine runtime | Weekly job uses an actual Responses reviewer; offline privacy, policy and VPN fixtures pass |
| Host bridges and bundled engines | Required external runtimes retained | OpenCode plugin remains host JavaScript; browser scripts and third-party engines retain their original execution environments |

`exonous status --json` lists native commands, hook capabilities and remaining compatibility/external runtimes. The npm entrypoint and old helper files remain as compatibility sources; they are not called by native hooks. Native sources and Cargo files are included in the source package. Build with `cargo build --release --locked`, then invoke that executable's `install`; use `--real-home` when intentionally installing from a development checkout.

## Verification and rollout

The Cargo package uses small modules for foreign input, routing, reminder formatting, repository/state IO, templates and tokens. Decisions remain separate from IO. Tests exercise public interfaces, host payloads and caller-visible output. State writers validate the home anchor and descendant ownership/permissions, use private files and publish through rename; token consumers claim the same compatibility filename atomically.

Run:

```bash
cargo fmt --all --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
node native/tests/parity.cjs
node --test test/*.test.js
```

CI adds native checks on Linux, macOS and Windows, while retaining the existing Node and WSL matrix. Release checks depend on both native and existing-runtime jobs. Configuration of a matrix is not evidence that its remote jobs have run; local validation in this change was on macOS ARM64.

Final local acceptance passed 120 top-level Rust tests and 560 compatibility tests, formatting, Clippy with warnings denied, workflow actionlint and the native leak scan. Independent QA, security and architecture reviews passed. An upgrade smoke using the original Node installer and a temporary home preserved personal settings and hooks, retired legacy core hooks and passed 863 native doctor checks; the registered native gate denied an unreviewed commit.

Operational acceptance after publication: run the configured Linux/macOS/Windows native matrix and compatibility WSL matrix, inspect the published per-target bundles, then run the hosted VPN/reviewer workflow with the configured secrets. No remote execution is claimed from local fixture results.

Each installed native version keeps its sibling assets. Failed activation restores previous bytes and executable permissions. For a deliberate rollback, run the retained previous executable's `install` with its matching assets and adapter selection, then run `doctor` and `gate --selftest` before relying on it. Native uninstall preserves vaults, settings outside owned entries, backups and edited files. Reinstalling the retained legacy package restores its hook registrations if legacy rollback is needed.

Gate differences are intentional: direct stdin heredocs and ambiguous implicit push configurations are conservatively refused; canceled dry-run and false help options are evaluated according to their effective behavior. The final differential corpus has 174 cases: 168 exact and six stricter native outcomes, with no unsafe allowances. Original Pyle runtime assertions replayed successfully; JavaScript source-spelling/loading assertions do not apply to a Rust executable.

Updates trust HTTPS distribution and the release checksum manifest from the same repository. SHA256 verifies bundle integrity; it is not a separate publisher signature. Archive audit rejects links, special entries, traversal, duplicates and oversized expansion before candidate execution. The resolved release SHA is recorded inside the install transaction. Development checkouts and explicit pins remain pinned.

## Performance evidence

`node native/benchmark.cjs target/release/exonous` warms both commands, compares their exact outputs, alternates execution order and collects thirty samples per implementation. It measures process startup plus one `ethos` invocation. A local macOS ARM64 run with Node 24.14.1 measured:

| Runtime | Median | p95 |
| --- | --- | --- |
| Node | 52.94 ms | 68.20 ms |
| Rust release | 6.80 ms | 8.58 ms |

These results describe that local command, not the entire harness or an LLM. The twelve graph profiles total 15,480 bytes versus 15,481 previously, so no material context-size reduction is established. Graph syntax, senior role labels and structural tests do not demonstrate better inference. A task evaluation must compare completion, rule violations, input/output tokens, model latency and cost before claiming gains from the prompt rewrite.

## Action and reason log

- Mapped the existing CLI, adapters and hooks with Atlas and captured the existing test baseline before adding native behavior.
- Preserved existing installations while implementing and testing native policy modules and explicit native activation.
- Rewrote twelve agent profiles into self-contained graph contracts, preserving routing identities and model tiers.
- Reused the source registry and originality gate; moved repository URLs to secrets and added selective reviewer decisions rather than automatic upstream adoption.
- Added a private VPN connection and cleanup path for the hosted runner; the user imported profile/auth directly into repository secrets. Hosted connectivity remains an operational check.
- Reproduced unsafe state permissions and agent event/brief regressions with failing tests, corrected their causes, and reran checks.
- Validated the existing private Responses gateway using synthetic input and strict structured output, without publishing its credential.
- Ported vault/handoff, concurrent automatic memory, first-party helpers, adapter writers, installer ownership, updater and legacy migration; replayed original callers where applicable.
- Independent QA reproduced quoting, CRLF, Git-for-Windows, migration argument and update-version issues; regression checks cover the fixes.
- Independent security review reproduced canceled dry-run and implicit push-plan authorization bypasses; real local Git fixtures now prove denial. Rollback permissions, stale-lock recovery and update provenance were also corrected.
- Added five native release targets with checksum packaging and separated build/read permissions from release publication.
- Updated the README before publication with the runtime boundaries and measured local results.
