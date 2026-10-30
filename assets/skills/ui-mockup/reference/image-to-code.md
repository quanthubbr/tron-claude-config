# Image → analysis → implementation (web)

For visually important **web** work when the runtime can both generate images and write frontend. The generated frame(s) are the primary visual source; code is faithful translation.

## Mandatory order

```
1. Generate reference image(s)
2. Deep structured analysis
3. Implement frontend to match
```

Do not open with freeform coding when the task is aesthetic-led and generation is available. User-supplied screenshots/refs skip step 1 but still require step 2 before code.

## Image count & sizing

Generate **enough** large, readable frames—bias toward **one primary image per section** when multiple sections exist. Extra detail renders beat one compressed mega-board with illegible type.

| Sections requested | Primary images |
|--------------------|----------------|
| 1 | 1 (+ optional detail) |
| N | N (+ detail for complex blocks) |

If text, buttons, or spacing are unclear: regenerate that section standalone (same system) or add a closer extraction frame—**never crop** an earlier composite.

## Analysis standard (per frame)

Extract before coding:

- Readable copy: H1, subhead, CTAs, section titles, nav/footer labels when visible  
- Type: size/weight relationships, line count, display vs body contrast  
- Spacing: headline-to-subhead, text-to-CTA, gutters, section vertical rhythm, card padding  
- Components: button shape, fill vs outline hierarchy, radius, dividers, shadows, card structure  
- Color: backgrounds, surfaces, accents, text hierarchy, image grade/tint  
- Layout: grid, alignment, section role, density  

If a field is unreadable, generate another image—do not guess from generic web defaults.

## Implementation fidelity

- Preserve layout logic, section order, spacing generosity, and component family from refs.  
- Do not “improve” into a template during coding.  
- Fill ambiguity by: (1) visible language, (2) layout/spacing logic, (3) component family, (4) extra image, (5) faithful inference last.

Hand off motion to **`ui-motion`**; stack specifics to **`ui-patterns`** after direction is fixed.

## Hero & first viewport

Calm, one focal point; headline ideally 1–3 lines; no pseudo-system pills (“orchestration layer” filler), badge walls, or nested panels eating the viewport. Must read cleanly on a **small laptop** width—not only 4K.

## Layout discipline for code

- **Anti matryoshka:** avoid giant rounded wrappers enclosing cards enclosing more cards.  
- **Reduce micro-chrome:** decorative chips, fake runtime labels, meaningless metadata rows.  
- Prefer open layout, fewer stronger containers, direct alignment.

## Variation engine (generation phase)

When you must generate refs first, use the same combinatorial commit as web comps (theme, background, type, hero architecture, section system, four signature components, two motion-implied cues)—see `web-comps.md` for lists. Generation rules there (one section per horizontal image) apply here too.

## Default section packs

Same 4 / 8 / 12 packs as web comps; implement in that order unless refs show otherwise.

## Multi-image consistency

All frames share one brand world before analysis merges into one codebase theme.

## Clarity check before shipping code

Images generated first; all analyzed; enough frames; no lazy single-board compression; hero clean; nested boxes avoided; colors/type/spacing extracted; coded UI still recognizable as the refs; small-laptop first view OK.

## When to skip image-first

Bugfixes, mostly technical tasks, or user provided complete design tokens/components and only needs wiring.

## Example mapping

| Ask | Actions |
|-----|---------|
| One startup hero | 1 hero image (+ detail if needed) → analyze → implement hero |
| 8-section landing | 8 section images (+ details) → full extraction pass → full page build |
| 4-section agency site | 4 frames, regenerate any unclear section → implement without drift |
