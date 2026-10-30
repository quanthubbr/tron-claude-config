# Parallel lanes

Use only when lanes are independent: no shared mutable files, no lane needs another's output. Anything uncertain runs sequentially.

## Before dispatch

Classify each task: **independent** (run now) · **sequential** (needs another lane's output) · **shared-file risk** (merge conflict likely) · **shared-domain risk** (decisions may clash even with different files). Parallelize only the independent ones.

State the lane map in the session — plan id + task numbers, worktree/branch, done-checks. Write it into the plan memory only if it must survive the session.

## Lanes

- One implementer per lane, `isolation: "worktree"`, named so it stays addressable. Long lanes: `run_in_background: true`.
- Each packet is self-contained: the lane's task excerpt, owned files, do-not-touch areas, done-checks. Agents do not inherit this conversation.
- Lanes do not talk to each other; facts one lane needs from another travel through the coordinator's next packet.
- Follow-ups and revisions go to the same lane agent via `SendMessage`.

## Safe to run in parallel

- navigator lookups on different areas
- implementation lanes on disjoint files
- `exo-security` dependency inventory while code is still moving
- reviews of a committed snapshot

## Never in parallel

- two agents editing the same file
- reviewing code another lane is still changing
- declaring the plan done before every lane is merged and verified together

## Merge

1. Collect every lane report; any `blocked` → resolve or stop before merging.
2. Merge lane branches one at a time (git is the coordinator's job).
3. Conflicts in source → a packet to the implementer that owns those files, with both lanes' reports; the coordinator does not hand-edit.
4. Run the gates of `SKILL.md` §5 once more on the merged result — `exo-qa` always, the others as they apply.
5. Close per `SKILL.md` §6.
