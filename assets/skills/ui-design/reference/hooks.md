# /ui-design hooks

Configure the **design detector hook** for the active project.

## What the hook does

On direct edits to UI-related extensions (framework markup, stylesheets, and plain JS/TS that may ship UI), the hook runs the bundled detector. Claude Code, Codex, and GitHub Copilot attach **post-edit** reminders; Cursor uses **preToolUse** to deny bad proposed writes; Grok Build marks touched files on PostToolUse and surfaces deduped findings on Stop.

**Rule tiers:** the fast pass catches mechanical issues (contrast, overflow, broken images, gradient type, glow shadows, token drift). Copy cadence, palette taste, and rhythm wait for the **Stop** deep pass over all touched UI files in the session (deduped against the fast pass). Set `hook.perEditRules` to `"all"` in `.impeccable/config.json` to run the full rule set on every edit.

Stop deep pass is wired on Claude Code, Codex, and Grok Build. Cursor lacks a reliable Stop dispatch—pre-write gate covers it. Copilot stop-style events do not feed the model, so Copilot keeps the full detector per edit. Grok emits an observe-only Stop with `reason: "shutdown"` after `end_turn`—**ignore that**; scan only `end_turn`.

Reflexes no scanner catches: [craft-floor.md](craft-floor.md). With no hook, `ui-design context` may emit `MANUAL_DETECTOR_REQUIRED` for one end-of-session detect.

## Config & env

| Key / env | Location | Effect |
|-----------|----------|--------|
| `hook.enabled` | `.impeccable/config.json` | Master switch for automatic hook |
| `hook.quiet` | same | Suppress clean/pending acks |
| `hook.auditLog` | same | NDJSON log path |
| `hook.consent` | `.impeccable/config.local.json` | Install consent recorded by CLI |
| `detector.ignoreRules` | shared config | Whole-rule suppressions |
| `detector.ignoreFiles` | shared config | Per-glob all-rule off |
| `detector.ignoreValues` | shared/local | Value-specific suppressions |
| `detector.extensions` | shared config | Extra template extensions (manual JSON edit) |
| `IMPECCABLE_HOOK_DISABLED` | env | One-shot off (overrides config) |
| `IMPECCABLE_HOOK_QUIET` | env | One-shot quiet |
| `IMPECCABLE_HOOK_LOG` | env | One-shot log path |

Manual `<skill-dir>/scripts/ui-design detect` honors project ignores unless `--no-config`. Raw scan: `<skill-dir>/scripts/ui-design detect --no-config …`.

## Harness manifests

| Harness | Manifest | Notes |
|---------|----------|-------|
| Claude Code | `.claude/settings.local.json` (gitignored) | Shared `settings.json` honored if moved |
| Codex | `.codex/hooks.json` | First run: approve via `/hooks` |
| Cursor | `.cursor/hooks.json` | Enable under Settings → Hooks |
| Grok Build | `.grok/hooks/` provider file | Requires `/hooks-trust` or `--trust` |
| GitHub Copilot | `.github/hooks/` committed team file | Loads from default branch |

`detector.extensions` entries look like `{ "ext": ".blade.php", "engine": "html" }` (`html` vs `text` analyzer).

## Actions (default: `status`)

| Action | Effect |
|--------|--------|
| `status` | State, paths, ignores, env overrides |
| `on` | Enable + repair manifests |
| `off` | Disable |
| `ignore-rule <id>` | Project-wide rule off (`overused-font` needs `--all-values`) |
| `ignore-file <glob>` | All rules off for matching paths |
| `ignore-value <id> <value> [--shared\|--local] [--reason "..."]` | Value suppression |
| `ignore-value <id> "*" --file <glob> [--file …]` or `--files=` | One rule off in listed files only |
| `reset` | Clear project hook config + provider entries |

## Flow

```bash
<skill-dir>/scripts/ui-design hooks <action> [args...]
```

Relay stdout verbatim. After `off`: note hook stays off until `on`. After `on`: note next UI edit triggers hook.

## Triage

| Outcome | Action |
|---------|--------|
| Real defect | Fix—never ignore to unblock |
| Proven FP / user-sanctioned | Narrowest ignore + disclose; `--reason "who: evidence"` |
| Uncertain | Ask once in one line |

Self-serve: `ignore-value`. `ignore-file` / `ignore-rule`: ask user first unless they requested project-wide off.

Narrowest first: value ignore → `ignore-value id "*" --file path` → whole file → whole rule.

Inline waivers when export must carry them: `impeccable-disable <rule>`, `impeccable-disable-line`, `impeccable-disable-next-line` (any comment syntax; optional reason after `:` or `--`). Bypass with `--no-inline-ignores` or `--no-config`.

## Examples (rewritten scenarios)

Font value exception:

```bash
<skill-dir>/scripts/ui-design hooks ignore-value overused-font Inter --shared --reason "User confirmed Inter is intentional"
```

Literal bounce animation:

```bash
<skill-dir>/scripts/ui-design hooks ignore-value bounce-easing bounce-ball --shared --reason "Agent: bounce easing is the subject of the animation"
```

Project-wide font rule (only when user asks):

```bash
<skill-dir>/scripts/ui-design hooks ignore-rule overused-font --all-values --reason "User asked to ignore overused-font globally"
```

Single rule in one file:

```bash
<skill-dir>/scripts/ui-design hooks ignore-value design-system-font-size "*" --file "src/overlay/widget.js" --reason "Injected widget owns its type scale"
```

Whole file out of scope:

```bash
<skill-dir>/scripts/ui-design hooks ignore-file "src/legacy/Card.tsx"
```

## Constraints

Do not hand-edit hook keys except `detector.extensions`. Do not patch hook binaries here. Malformed config files are skipped—`hooks status` lists them. Disabling hook stops Cursor blocks **and** other harness reminders.
