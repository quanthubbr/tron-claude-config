---
name: ui-mockup
description: Use when you need UI comps or mockups from an image model (web sections or mobile screens), when a reference screenshot or render should drive faithful frontend implementation, or when producing a brand-kit / identity board. Routes to platform-specific references; pairs with ui-design for direction and exo-frontend / exo-mobile for builds.
user-invocable: true
argument-hint: "[web-comps | mobile-comps | image-to-code | brandkit] brief or target"
---

# ui-mockup

Image models are for **reference fidelity**, not decoration. Output must read as buildable UI: hierarchy, spacing, type scale, CTAs, and component logic visible at a glance. Prefer **`ui-design`** for live direction, critique, and engine workflow before heavy image generation. Delegate implementation to **`exo-frontend`** (web) or **`exo-mobile`** (native). Use **`ui-patterns`** only after direction is set, for charts, forms, nav patterns, and stack notes.

## When image generation pays off

| Situation | Prefer |
|-----------|--------|
| New marketing page, hero, or multi-section landing where layout ambition matters | Generate comps first → `reference/web-comps.md` |
| Mobile flow (onboarding, checkout, dashboard) needing readable screen sets | `reference/mobile-comps.md` |
| User supplied a comp/screenshot OR you must match a generated look in code | `reference/image-to-code.md` |
| Logo system, palette board, identity deck for a product name | `reference/brandkit.md` |
| Small tweak to existing coded UI, bugfix, or user already gave tokens/components | Code first; skip image gen |
| Pure data dashboard with no visual redesign ask | `ui-patterns` charts; skip comps |

Generating images costs tokens and time. Use it when visual novelty, cross-section consistency, or extraction fidelity would otherwise fail—not when the repo already owns a design system.

## Shared prompting principles

1. **One analyzable unit per image** — one web section per horizontal frame; one mobile screen (or deliberate multi-device layout) per frame. Never squash a whole site into one unreadable board.
2. **Regenerate, never crop** — if a section or screen needs clarity, produce a fresh render with the same locked system; do not zoom/crop an earlier composite (cropping breaks spacing and type relationships).
3. **Lock a design bible** across a set: palette, type mood, radius, CTA family, image grade, spacing cadence. Vary composition and density; do not vary product identity.
4. **Brief overrides defaults** — interpret adjectives (minimal, editorial, SaaS, luxury) before applying internal dials.
5. **Implementation clarity** — comps should answer “how would I build this?” Avoid mood-only abstract art unless the user asked for moodboards.
6. **Generous spacing, controlled density** — premium layouts breathe; alternate calm and rich sections.
7. **Anti-template discipline** — reject default purple-blue glow heroes, blob clutter, cloned card rows, fake KPI walls, marquee logo mosquitoes, and filler marketing copy (see shared slop list in references).

### Default dials (adapt per brief)

| Dial | Default | Meaning |
|------|---------|---------|
| Design variance | 8 | 1 = rigid symmetry, 10 = bold asymmetry |
| Visual density | 3–4 | Lower for mobile and image-to-code extraction |
| Art direction | 8–9 | Controlled premium, not safe template |
| Spacing generosity | 8–9 | Even section gaps, airy heroes |
| Image priority | 9 | Image-led when category fits; typographic-only when brief demands |

## Routing

| User intent | Read | Output |
|-------------|------|--------|
| Website / landing section comps only (no code in this turn) | `reference/web-comps.md` | N horizontal section images |
| App screens / flows (images only) | `reference/mobile-comps.md` | N screen images in phone mockups |
| Build site from generated or supplied visuals | `reference/image-to-code.md` | Images (if needed) → structured analysis → code |
| Brand guidelines board, logo exploration | `reference/brandkit.md` | Usually one grid board image |

## Cross-skill handoff

- After comps exist, **`exo-designer`** can spec gaps; **`exo-frontend`** / **`exo-mobile`** implement.
- Motion implied in stills is not spec—hand motion work to **`ui-motion`** (web/Expo) or **`native-ui`** (platform chrome).
- Do not duplicate **`ui-design`** engine verbs or its `PRODUCT.md` / `DESIGN.md` workflows here.

## Pre-delivery check (all modes)

- Count matches requested sections/screens.
- Text legible at normal viewing size.
- One coherent brand world across the set.
- No obvious AI slop (blobs, nested card matryoshka, fake enterprise micro-labels).
- Hero / first screen: single focal point, short headline, obvious primary action.

Detailed checklists live in each reference file.
