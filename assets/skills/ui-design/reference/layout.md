Spatial design encodes priority as reading order, grouping, rhythm, and usable area—diagnose before moving boxes.

---

## Visitor mode

- **Persuade + Experience:** asymmetric or fluid composition when the selected world supports it.
- **Operate + Read:** stable density, predictable structure, easy linear navigation.
- **Native:** platform guides for nav, insets, adaptation, and touch targets.

Keep the visual world. Layout changes structure inside it; identity replacement → [new-work.md](new-work.md).


```layout-body
## Dual pass (design + detector)

Sub-agents when permitted; else sequential.

1. **Layout assessment** (rendered or source evidence):
   - **Reading order:** squint test—primary, secondary, major groups in order?
   - **Grouping:** proximity vs container compensation?
   - **Rhythm:** tight/generous cadence vs one repeated spacing?
   - **Structure:** topology matches content/task? equivalent cards/columns or framework default?
   - **Density:** information per region vs use frequency and complexity?
   - **Adaptation:** narrow/intermediate/wide/zoom/i18n—what reflows? DOM/focus order vs visual order?
   - **Extremes:** long copy, empty, overlays, sticky, safe areas, small targets?

2. **Mechanical scan:**

```bash
<skill-dir>/scripts/ui-design detect --json --scope layout [target files or dirs]
```

Inspect spacing/overflow/stacking the detector misses. Synthesize; clean scan ≠ good hierarchy.

## Spatial thesis

Name: primary path; what groups vs separates; lead vs support; density/rhythm; behavior across viewports/input/content extremes.

Simplest model that expresses those relationships. Primitives match relationships they control; semantic spacing/container roles.

## Apply

- Group by meaning—proximity before extra containers.
- Rhythm via contrasting tight/generous intervals.
- Documented spacing scale; 4-unit base often fills gaps 8-only misses.
- Hierarchy from product priority, not framework defaults.
- Distinct content visually distinct— not every group isolated in chrome.
- Responsive behavior structural: reorder/collapse/reflow/reveal by importance.
- Container-aware components in varying contexts.
- `gap` for sibling rhythm when clearer than child margins.
- Usable touch targets even when visible marks are small.
- Depth only for state/hierarchy clarity.
- Optical fixes after render review.

Repetition supports recognition; break it when priority/content changes.

## Verify

- Squint test still passes.
- Path clear at every supported size.
- Related groups; unrelated separated.
- Intentional rhythm.
- Density matches use and complexity.
- Long/empty/i18n/zoom/dynamic content stable.
- Keyboard/touch/AT order matches visual order.
- Final scan clean.

Evidence, rescan. Then `/ui-design polish`.

## Live-mode signature params

Each variant declares `density`; spacing via `var(--p-density, 1)`.

```json
{"id":"density","kind":"range","min":0.6,"max":1.4,"step":0.05,"default":1,"label":"Density"}
```

One structural param only when topology genuinely branches. Follow [live.md](live.md).

```
