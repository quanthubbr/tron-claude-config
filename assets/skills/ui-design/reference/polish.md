> **Gather:** quality bar and ship constraints.

Refinement only—never a disguised redesign. Keep the current visual language, copy, behavior, and anything out of scope. When the concept is wrong, say so and route to redesign or `bolder` instead of swapping direction quietly.

Detector hits are hints; judge the rendered UI and real interaction paths yourself.

## Anchor in the system


```polish-protocol
Read DESIGN.md plus tokens, shared components, patterns, and neighboring flows. Without a formal system, follow stable project conventions.

Before fixing drift, label it:

- **missing token** — needs a reusable value in the system;
- **one-off** — should use an existing shared component or pattern;
- **IA mismatch** — flow or hierarchy diverges from peer areas;
- **local defect** — incomplete or inconsistent implementation.

Fix at the narrowest correct layer. Ask when a binding system rule is unclear.

## Collect evidence

Exercise the feature at representative sizes: desktop and mobile on web; on native (`ios` / `android` / `adaptive`), shipped device classes on simulator, emulator, or hardware per platform build verification. Establish:

- functional completeness;
- target quality bar and time budget;
- known constraints or intentional gaps;
- states, content lengths, roles, and input modes users will hit.

When a prior critique exists, treat it as one input:

```bash
<skill-dir>/scripts/ui-design critique-storage latest "<resolved target>" --json
```

Exit 0 returns JSON with snapshot `body` and exact `snapshot_file`. Retain `snapshot_file` through the pass. Local files: helper compares current fingerprint to critique’s; unchanged staged/unstaged/untracked content stays current; any byte change, deletion, or non-file replacement closes that backlog while keeping trend history (exit 2). URL targets stay current until explicitly closed. When current, apply relevant P0/P1 items from `body` and cite the snapshot. Exit 2 means none exists or the target moved. Independent pass either way.

## Triage order

1. broken tasks, data loss, misleading state, blocked accessibility paths;
2. missing loading, empty, error, success, disabled, permission states;
3. flow, hierarchy, responsive, and design-system drift;
4. visual and motion inconsistencies;
5. code and asset cleanup.

Do not polish one corner while the rest of the path lags.

## Whole-path checklist

**Flow and hierarchy:** match neighbor mental models, terminology, disclosure, routing, saves, optimistic/pessimistic patterns; make primary task and state obvious without flattening everything; connect arrival, transition, empty, and recovery paths.

**Layout and type:** honor grid and spacing; fix optical and math alignment; group related content tightly; keep same-role typography consistent; test measure, wrap, i18n expansion, zoom, font loading; every supported viewport—not just the current frame.

**Color, imagery, icons:** semantic tokens; stable color meanings; contrast in all states; coherent icon family and sizing; no image layout shift; correct aspects, responsive sources, meaningful alt text.

**Interaction:** full control states; keyboard focus and tab order; platform touch targets; coherent, interruptible motion—no animation for show; exercise long, missing, localized, offline, slow, and permission-limited content where applicable.

**Content and code:** consistent terminology and factual copy (ask before changing claims); remove debug noise and polish-only duplication; prefer shared components; promote reusable values to tokens—don’t abstract one-offs.

## Close the pass

Re-walk with mouse, keyboard, and touch. Check layouts across breakpoints/device classes; key states; zoom, contrast, focus, screen readers; console errors, CLS, latency; DESIGN.md alignment and user scope.

Follow `ui-design context` and hooks; other QA as needed. Manual scan only when no automatic detector runs—do not add another detector pass. Document narrow intentional exceptions; clean scans ≠ visual sign-off.

Diff sources: drop accidental churn and temp artifacts. Ship when functionally complete and evenly finished.

When all Priority Issues from a read snapshot are cleared:

```bash
<skill-dir>/scripts/ui-design critique-storage close "<resolved target>" "<snapshot_file from latest>"
```

Closes only the processed snapshot. Do not close without a read snapshot, without retained `snapshot_file`, or with Priority Issues left open.

```
