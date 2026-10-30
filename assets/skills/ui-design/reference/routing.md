# Command guidance

## Workflow questions

Answer without executing commands. The no-argument menu below is only for bare `/ui-design` invocations. Pull prerequisites from command references as needed. If the user also wants execution, follow that request.

## No-argument routing: context-aware menu

Use when the user invokes `/ui-design` with no argument—they want “what should I do next?”

Setup already ran `ui-design context`.

- If output included `NO_PRODUCT_MD`, lead with `/ui-design init` (one line why) and still show the full menu below—do not silently run init.
- Otherwise run `<skill-dir>/scripts/ui-design signals` once, read JSON, and lead with **2–3 highest-value commands** (one-line reason each from signals), then the full Commands table from SKILL.md grouped by category. **Never auto-run; suggestions only.**

Reason over signals—no fixed score:

| Signal | Suggestion |
|--------|------------|
| `setup.hasDesign` false, `setup.hasCode` true | `document`—capture the visual system |
| `critique.latest` null | First critique on a real surface: `/ui-design critique <surface>` |
| Low `critique.latest.score` or non-zero `p0`/`p1` | `polish` (reads snapshot as backlog) |
| `git.changedFiles` on one surface | Scope `audit` or `polish` to those files by name |
| `devServer.running` true | `live` for in-browser iteration (web only) |
| `setup.platform` ios/android/adaptive | Do not lead with `live` or bundled HTML detector |

Otherwise group by intent (build / improve / iterate) for current surface and platform.

**Detector assist (web only):** When `scan.targets` is non-empty and platform is not native, run once:

```bash
<skill-dir>/scripts/ui-design detect --json <targets...>
```

`scan.via` explains the set (`git-changes`, `source-dir`, `html`, `root`). Fold hits into picks: quality/contrast → `audit` or `polish`; slop families → matching refine command (gradient text → `quieter`/`typeset`, flat gray → `colorize`, etc.). On error or huge trees, skip and suggest manual `audit`—never block the menu.

Keep the lede to 2–3 exact commands to type; full table stays fallback.
