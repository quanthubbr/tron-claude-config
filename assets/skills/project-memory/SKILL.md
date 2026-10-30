---
name: project-memory
description: Durable project memory in the Obsidian vault — ADRs, plans and docs anchored to code (links + line-range evidence with drift check), searched locally and offline. Use to look up past decisions or plans before working ("what did we decide about X", "is there a plan for Y"), to record a decision, plan or explanation, and to check whether memories still match the code.
---

# project-memory

Keep facts that outlive the session; conversation history never goes in.

| Kind | Holds | Lifecycle |
|---|---|---|
| `adr` | a decision, why, consequences | durable; supersede with a new ADR, never rewrite history |
| `plan` | work that has not happened yet | removed once executed; durable outcomes become a fresh `adr`/`doc` |
| `doc` | how something works now, gotchas, recipes | updated in place |

Picking a kind: a choice with its rationale → `adr`; something still to be built → `plan`; an explanation of current behavior or a trap → `doc`.

## Command

```bash
M="node ~/.claude/skills/project-memory/project-memory.mjs"
```

Run inside the project repo (project = repo name; `--project <name>` elsewhere). Vault root, first match wins: `PROJECT_MEMORY_VAULT` → `config.json` next to this file (`{ "vault": "<abs path>" }`, optional per-skill override) → the exonous vault (`~/.claude/exonous/config.json`, set by `exonous install` / `exonous vault set <path>`). Memories live in `<vault>/<project>/memory/<kind>/`. No vault (exit 3) → run `exonous vault detect`, confirm the path with the user, then `exonous vault set <path>`.

## Read — locate first

```bash
$M search "auth token refresh"            # ranked ids + first line; also ranks plain vault notes
$M search "auth" --kind adr --limit 3
$M show adr-0004                          # full body only for the hit that matters
$M list --kind plan --status open
$M search "checkout rounding" --kind session   # automatic session pages (<project>/sessions/, written by hooks)
```

Never read the whole vault. Search, then `show` the one or two hits you need. No hits → say so; don't fall back to reading everything.

## Write

```bash
$M add adr --title "Use WAL mode" --body "Readers never block writers. Rejected: rollback journal (lock contention)." \
  --tag db --link symbol:openStore --link file:src/store.ts --evidence src/store.ts:30-41
$M add plan --title "Split billing module" --body-file /tmp/plan.md --tag billing
$M update plan-0002 --status in-progress --body-file /tmp/plan.md
$M update adr-0004 --add-evidence src/auth.ts:12-20 --remove-evidence src/old.ts
$M remove plan-0002                       # adr/doc need --force
```

- Search before adding — update an existing memory instead of creating a near-duplicate.
- One topic per memory, anchored to the code it describes; a giant mixed note goes stale fast.
- Evidence is pinned to a content hash at write time. Never paste secrets, tokens or personal data into a memory.

## Validate

```bash
$M validate      # exit 1 when evidence drifted/moved or links no longer resolve
```

Run after refactors, before trusting an old memory, and at the close of `/deliver`. Fix `moved` with `--remove-evidence` + `--add-evidence` at the new range; fix `drift` by re-reading the code and updating the body.
