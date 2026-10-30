> **Additional context needed**: existing brand colors.

Use color for hierarchy, meaning, and atmosphere. Keep confirmed brand and semantic conventions—do not swap identities under the guise of “more color.”

---

## Visitor mode


```colorize-body
- **Persuade + Experience:** color may carry voice and own large regions when the world calls for it.
- **Operate + Read:** color encodes action, selection, status, wayfinding, reading order; rare accents hit harder.

## Audit first

Read DESIGN.md, tokens, themes, representative states. Note:

- confirmed brand colors;
- surface/text/action/semantic roles today;
- grayscale hiding hierarchy or state;
- contrast failures and color-only cues;
- light/dark or chart needs;
- whether the task wants more color vs new identity.

New identity → [new-work.md](new-work.md). Ask when brand decisions are unknowable.

## Strategy

Name emotional temperature, dominant relationships, contrast range, and dosage before editing. Build **roles**, not a swatch bag:

- canvas and elevated surfaces;
- primary/secondary text;
- action, focus, selection;
- borders/separators;
- success, warning, error, info;
- data categories when needed.

Prefer project color space; new web palettes often OKLCH for predictable L/C. Hue from product meaning and direction—not default category colors.

## System-scale application

- Let strong color own a region/role—not scattered specks.
- Primary action stays findable; don’t spend action color on decoration.
- Tint neutrals only when brand hue genuinely binds the world; neutral gray is valid.
- On colored surfaces, derive secondary text from fg/surface hue—not washed gray.
- Stable semantic meanings; respect platform/domain conventions.
- Charts: lightness, chroma, shape, label, pattern—not color alone.
- Dark mode: explicit elevation/contrast—no mechanical light invert.
- Primitives + semantic tokens when the project uses them.

Decoration without hierarchy/state/content/world tie-in is not strategy.

## Contrast

| Content | WCAG AA |
|---|---|
| normal copy | 4.5:1 |
| large text | 3:1 |
| controls, icons, focus | 3:1 |

Check interactive states, overlays, text-on-image, disabled, both themes. Simulate common color-vision deficiencies. Color-coded info needs non-color backup.

OKLCH ramps: vary L; reduce C near white/black. Prefer explicit colors over alpha chains that make contrast context-dependent.

## Verify

- Each color has a stable role or atmospheric job.
- Attention lands on intended action/content/state.
- Works in quiet, dense, interactive, error, empty states.
- Light and dark each composed.
- Contrast + non-color cues pass.
- Reads as this product—not generic “colorful.”

Then `/ui-design polish`.

## Live-mode signature params

Each variant declares `color-amount`. Author against `var(--p-color-amount, 0.5)`.

```json
{"id":"color-amount","kind":"range","min":0,"max":1,"step":0.05,"default":0.5,"label":"Color amount"}
```

At most two extra variant params (palette, temperature, tint). Follow [live.md](live.md).

```
