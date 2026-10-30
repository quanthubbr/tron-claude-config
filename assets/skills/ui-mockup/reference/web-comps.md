# Web section comps (image only)

Generates **horizontal UI reference frames** for marketing sites, landings, portfolios, and product pages. Does not write code in this mode.

## Hard output rule

**One separate horizontal image per section.** Never one tall page, never a collage of sections.

| Request | Default section count | Images |
|---------|----------------------|--------|
| Single hero | 1 | 1 |
| Landing / site template (unspecified) | 6 | 6 |
| Full marketing site | 8 | 8 |
| Product page | 6 | 6 |

Format: 16:9 or 21:9 for hero; 16:10 acceptable for content bands. Label each output `Section X of N: <name>`. If the tool emits one image at a time, continue until N is complete.

## Hero composition

**Do not default to text-left / image-right** — the most overused pattern. Prefer when stronger: centered over full-bleed image, bottom-left/right overlay, stacked center minimalist, image-as-canvas with safe text zone, off-grid editorial, inverted split, mini minimalist (logo + line + thin CTA).

Hero rules: short H1 (roughly 5–10 strong words), 1–3 lines max; one primary CTA; no pill/badge/stat spam in the first viewport.

## Brief → direction (quick map)

| Brief signals | Hero scale | Background bias | Composition |
|---------------|------------|-----------------|-------------|
| minimal / swiss / type-only | Mini | Solids, subtle texture | Stacked center, huge whitespace |
| editorial / fashion | Mid or giant | Duotone, side image | Off-grid, strong type contrast |
| cinematic / luxury | Giant | Full-bleed + overlay, vignette | Text over image, low in frame |
| SaaS / fintech / infra | Mid | Solid + product crop | Trust anchors, high clarity |
| agency / portfolio | Giant or mini (pick one) | Bold variety | Poster-like |
| commerce | Mid, product-led | Product full-bleed | Obvious CTAs |

Silent brief: use shared dials from parent SKILL; pick one hero scale decisively.

## Variation engine (commit to one combo)

Pick one per category; execute consistently across all section images.

- **Theme:** pristine light, deep dark, bold studio solid, quiet premium neutral.
- **Background character:** subtle grid, solid + ambient depth, full-bleed cinematic, tactile texture.
- **Type mood:** clean grotesk, refined grotesk, expressive display, compressed display, serif+sans editorial, swiss hierarchy.
- **Hero architecture:** cinematic center, asymmetric split, polaroid scatter, type-dominant, editorial offset, image-first restrained text.
- **Section system:** bento rhythm, alternating editorial, poster stack, gallery cadence, swiss grid, asymmetric marketing flow.
- **Four signature components** (examples): gapless bento, staggered masonry, accordion slice row, polaroid arc, marquee strip, metrics strip, testimonial wall, UI panel stack—use purposefully, not all at once.
- **Two motion-implied cues** (static only): stagger reveal, parallax drift, pinned narrative, accordion expansion, fade-through.
- **Per section:** one composition anchor + one background mode; **≥3 distinct anchors** across the page; vary CTA style at least once.
- **Narrative spine (one):** artifact, journey, precision tool, living system, stage, archive.
- **Second-read moment (one on page):** asymmetric bleed, oversized numeral, material switch, side-rail note, macro crop—must aid scan order.

## Continuity across sections

Same palette (primary, secondary, accent, neutrals), type family, radius language, CTA identity, image grade. Section mood may shift intensity; do not swap palettes per section.

## Default section packs

**4:** Hero → Features → Social proof → CTA  

**8:** Hero → Trust → Features → Product → Benefits → Testimonials → Pricing → CTA  

**12:** Hero → Trust → Feature grid → Product preview → Problem/solution → Benefits → Workflow → Metrics → Testimonials → Pricing → FAQ → CTA/footer  

## Web-specific slop (avoid)

Endless centered stacks; identical card rows; purple-blue mesh gradients; gradient text as fake premium; fake brand names; three-column KPI clichés; unreadable logo tickers; charts when the brand is not analytics-native.

## Response sequence

1. Infer site type and conversion goal.  
2. Fix section count N; announce it.  
3. Choose hero scale + variation combo + spine + second-read.  
4. For each section: anchor, background mode, CTA variant, density (mix large / mini / medium bands).  
5. Run clarity check: hierarchy, breath, composition variety, image count = N, palette locked, hero not lazy split layout.  
6. Emit all N images; do not stop at one summary image.

## Extra edge (multi-section sites)

- Pace foreground/background intensity across scroll.  
- One unmistakable primary action per major tier.  
- ≥2 distinct image crops when N≥4.  
- Charts only when site type needs them; else human proof.  
- Industry/regional brief → align palette and type temperament.
