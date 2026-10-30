# Doctor

Report and repair drift between project **ui-design artifacts** and what the installed engine reads: `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/config.json`, surface briefs, design hook.

Maintenance only—no redesign, no files outside the report, no other commands as side effects.

## Drift kinds

- **Tool version** — `UPDATE_AVAILABLE` from context; package maintainers own updates—not doctor.
- **Schema drift** — retired fields/locations; doctor `--fix` handles most.
- **Truth drift** — code moved on; `document` / `init` own updates; doctor surfaces gaps.

## Step 1: Run

```bash
<skill-dir>/scripts/ui-design doctor --json
```

`--target <path>` in monorepos when user named a workspace/route.

Output: `findings[]` (`id`, `artifact`, `path`, `severity`, `summary`, `fix`); optional `workspaces`. `ruleRegistryAvailable: false` → say ignored-rule validation was skipped.

Empty findings → one-line OK and stop.

## Step 2: Severities

- **`auto`** — run `doctor --fix` once without asking; report moves in one line
- **`mention`** — tell user; no decision now
- **`route`** — name command + gap; run only if user asks this turn

## Step 3: Deprecated fields

Deprecated sections (e.g. retired `## Register`) are **absent for decisions**—offer deletion.

## Step 4: Truth drift restraint

`design-md-drift` = commit count since DESIGN.md edit—not proof of wrong doc. Report number; if user wants truth, compare tokens/components manually.

`workspace-context-inherited` — behavior by design; multi-app fit is a user question.

## Monorepo notes

- **workspace-platform-native-evidence** — native files + inherited web `PRODUCT.md` → child `PRODUCT.md` with correct platform
- **config-project-roots-match-nothing** — report globs; ask intended roots
- **config-invalid-build-path** / **config-build-path-unset** — `buildPath` `comp`|`code` in engine state config; unset offer only when image generation exists

## Boot check opt-out

`"stalenessCheck": false` in `.impeccable/config.json` or `IMPECCABLE_NO_STALENESS_CHECK=1` for one session. Doctor still works when boot check off.
