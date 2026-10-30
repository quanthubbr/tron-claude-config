# Git workflow

## Commits

```text
<type>: <description>

<optional body>
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

**Never** add `Co-Authored-By`, Cursor/AI attribution lines, or similar trailers.

**Never** bypass hooks (`--no-verify`, `--no-gpg-sign`, etc.) unless the user explicitly requests it in the current instruction.

**Never** force-push shared branches. **Never** auto-merge dependency bumps without human review.

Only commit when the user asks (or project harness authorizes via its commit skill/token).

## Pull requests

1. Inspect all commits since branching — not only HEAD.
2. `git diff <base>...HEAD` for the full change set.
3. Body: summary bullets + test plan checklist.
4. First push: `git push -u origin <branch>`.

Cross-session progress: `/session-handoff`.

Implementation order before git: [development-workflow.md](./development-workflow.md).
