---
description: Get a failing build or type check green again with the smallest safe edits, one error at a time.
---

# /build-fix

Restore a passing build. Smallest diff wins; no refactoring on the way.

## 1. Find the build

| Marker | Run |
|---|---|
| `package.json` `build` script | the project's package manager: `pnpm build` / `npm run build` / `bun run build` |
| `tsconfig.json` only | `npx tsc --noEmit` |
| `Cargo.toml` | `cargo build` |
| `go.mod` | `go build ./...` |
| `pom.xml` | `mvn -q compile` |
| `build.gradle(.kts)` | `./gradlew compileJava` or `compileKotlin` |
| `pyproject.toml` | `mypy .` if configured, else `python -m compileall -q .` |

Several markers → build the one CI runs (check the workflow files).

## 2. Triage

Capture the full error output, group it by file, and order it so root causes come first: missing modules and broken imports, then type declarations, then call sites. Keep a running count so progress is visible.

## 3. Fix loop

Per error: read about 10 lines of context around it → name the cause → make the minimal edit → rebuild → confirm the count dropped and nothing new appeared. Then take the next one.

| Cause | Move |
|---|---|
| Unresolved import/module | Confirm the package is installed and the path/alias is right; propose the install command rather than running it |
| Type mismatch | Read both declarations; narrow at the boundary instead of widening to `any`/`unknown` casts |
| Import cycle | Trace the cycle; move the shared piece into its own module |
| Version skew | Compare manifest constraints with the lockfile |
| Tool misconfiguration | Diff the config against the tool's documented defaults; never weaken lint/type settings to pass |

## 4. Stop and ask when

- a fix creates more errors than it removes;
- the same error survives three attempts;
- the real fix is architectural;
- dependencies must be installed or upgraded.

## 5. Report

Fixed (file list), still failing, newly introduced (target: none), and the suggested next step for anything unresolved.
