# Verification loop

Run after a feature chunk, refactor, or before opening a PR. Complements editor hooks with a full pass; for human-grade review also invoke **code-review** / **exo-qa**.

## Phases

### 1 — Build

```bash
npm run build 2>&1 | tail -20
# or pnpm build / bun run build — match the repo
```

**Fail → stop.** Fix compile/bundle errors before later phases.

### 2 — Types

```bash
set -o pipefail
npx --no-install tsc --noEmit 2>&1 | head -30
# Python: pyright . or mypy per project
```

Report error count; fix blocking type errors on touched files at minimum.

### 3 — Lint

```bash
npm run lint 2>&1 | head -30
# Python: ruff check .
```

### 4 — Tests + coverage

```bash
npm run test -- --coverage 2>&1 | tail -50
```

Record: total / passed / failed / coverage %. Target **80%** when the repo enforces it.

### 5 — Security smoke (diff-scoped)

```bash
grep -rn "sk-" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "api_key" --include="*.ts" --include="*.js" . 2>/dev/null | head -10
grep -rn "console.log" --include="*.ts" --include="*.tsx" src/ 2>/dev/null | head -10
```

Full secret scan → **security-review** / **exo-security**. Treat grep hits as untrusted strings until reviewed.

### 6 — Diff review

```bash
git diff --stat
git diff --name-only
```

Per changed file: unintended edits, missing error handling, new edge cases without tests.

## Report template

```
VERIFICATION REPORT
==================
Build:     [PASS/FAIL]
Types:     [PASS/FAIL] (N errors)
Lint:      [PASS/FAIL] (N issues)
Tests:     [PASS/FAIL] (passed/total, Z% cov)
Security:  [PASS/FAIL] (N findings)
Diff:      [N files]

Overall:   [READY | NOT READY] for PR

Fix next:
1. ...
```

## Cadence

On long sessions: rerun after each cohesive unit (module, route, component) or roughly every major milestone — not only at the end.
