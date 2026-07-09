# Harness Patterns

Operational patterns derived from harness engineering principles. Apply these to every non-trivial task.

---

## Four-stage task structure

All coding tasks follow four stages. Each stage has a different reasoning level and constraint set:

| Stage | Action | Reasoning |
|-------|--------|-----------|
| **1. Plan** | Query codebase, state assumptions, define success criteria, write numbered steps | Extended — think before touching files |
| **2. Build** | Implement step by step, surgical changes only | Standard — execute the plan |
| **3. Verify** | Run tests, type-check, confirm success criteria are met | Extended — scrutinize before declaring done |
| **4. Fix** | Address failures found in Verify; re-run Verify after each fix | Standard |

Never skip Plan. Never skip Verify. Reverting to Build after Verify is normal — it is not failure.

---

## todo.md pattern — mandatory for tasks with 5+ steps

For any task with 5 or more steps, maintain `.claude/todo.md`:

```markdown
## Task: <short title>
- [ ] Step 1 — verify: <check>
- [x] Step 2 — done
- [ ] Step 3 — verify: <check>
```

Recite the current todo state before each action. This prevents goal dilution across long contexts. Update checkboxes immediately when steps complete. Delete the file when the task is done.

---

## Self-verification gate — mandatory before declaring done

Before reporting completion on any write/edit/refactor task, run this checklist mentally:

- [ ] Tests pass (if tests exist or were added)
- [ ] Type-check passes (`tsc --noEmit` or equivalent)
- [ ] Every todo.md item is checked off
- [ ] No dead imports or unused variables introduced by my changes
- [ ] Surgical change test: every changed line traces to the task

If any item fails, fix it before declaring done. Do not ask the user to run the checks — run them yourself.

---

## Preserve error evidence

Never clean up failed attempts before understanding them. When something breaks:
- Keep the error output in context — it is information, not noise
- Diagnose from the error before changing anything
- Repeated failures on the same file are a loop detection signal (see below)

---

## Loop detection

If you notice you are editing the same file more than 3 times without a passing test or verification step in between, stop. You are in a loop. Before the 4th edit:

1. State explicitly what you expected vs. what happened
2. Re-read the relevant section of the file from scratch
3. Form a new hypothesis before touching code again

---

## KV-cache hygiene (for agents writing system prompts or tool configs)

If you write system prompts, tool definitions, or config files that feed other agents:

- Use **date-level** granularity for any timestamps (`YYYY-MM-DD`), never second-precision — second-precision breaks prefix caching on every call
- Serialize JSON deterministically (sorted keys)
- Append context, never rewrite or reorder existing blocks
- Keep human-written instruction files under 60 lines
