Type expresses hierarchy, meaning, and voice. Improve it inside the established world—don’t swap identity unless asked.

---

## Visitor mode

- **Persuade + Experience:** display type may carry voice; decisive contrast and responsive scale when composition benefits.
- **Operate + Read:** stability, scanability, measure first; one tuned family + fixed role scale often wins.
- **Native:** platform refs `ios.md` / `android.md`, including scaling and a11y.

Identity replacement → [new-work.md](new-work.md) + DESIGN.md update. Otherwise keep confirmed families and refine use.

## Two isolated assessments

With sub-agent tools when permitted, run independently; else sequential. Do not let detector output anchor the design pass.

1. **Typographic assessment** (file/selector/value evidence):
   - Authority/fit: faces, weights, roles; defaults vs intentional; necessary families?
   - Hierarchy: heading/body/label/metadata/data distinguishable? adjacent sizes too close?
   - Scale: deliberate role ramp vs arbitrary values; consistency across screens/states?
   - Reading: 45–75ch body measure; line-height, rhythm, contrast, tracking for face/width/language?
   - Stress: long headings, i18n expansion, zoom, narrow boxes, missing weights, fallback?
   - Delivery: load only used assets; fallback metrics; avoid FOIT/reflow shock?

2. **Mechanical scan:**

```bash
<skill-dir>/scripts/ui-design detect --json --scope type [target files or dirs]
```

Inspect dynamic/arbitrary values the detector misses. Synthesize both; clean scan is floor, not proof.

## Set the system

Before edits, state: required roles; contrast between roles; measure/density; authoritative faces/weights; perf/i18n/a11y constraints.

Fewest roles/families for unmistakable hierarchy. Combine size, weight, space, tone—don’t rely on size alone. Role names describe purpose, not raw values.

## Apply

- Body readable and zoomable; 1rem/16px web floor unless dense role, platform norm, or user setting says otherwise.
- Prose 45–75ch; wider lines → more leading.
- Light-on-dark: slightly more leading, tracking, and weight when the face needs it.
- Tune leading to face, width, language, contrast—not one global ratio.
- Repeat roles identically across states.
- Use numeric/tabular/code/label features when content benefits.
- Load only needed weights; metric-compatible fallbacks; avoid blocking text.
- Marketing display may respond to space; dense product surfaces stay predictable.
- Preserve zoom, user fonts, Dynamic Type, platform text scaling.
- Paragraph spacing **or** first-line indent—not both.

No decorative type that hurts comprehension; no second family without a role only it can fill.

## Verify

- Roles recognizable without reading copy.
- Long text comfortable across widths/languages.
- Typography belongs to product/world.
- Loading without disruptive reflow/invisible text.
- Zoom, scaling, focus, contrast, narrow viewports OK.
- Final scan: no unexplained findings.

Evidence per item, then rescan. Then `/ui-design polish`.

## Live-mode signature params

Each variant declares `scale`; ramp against `var(--p-scale, 1)`.

```json
{"id":"scale","kind":"range","min":0.85,"max":1.3,"step":0.05,"default":1,"label":"Scale"}
```

At most one pairing/weight param for real system choices. Follow [live.md](live.md).
