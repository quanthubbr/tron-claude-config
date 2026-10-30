# Premium agency-grade UI

Use when the brief asks for high-end consumer SaaS, luxury marketing, or award-tier spatial rhythm with haptic depth and choreographed motion.

## Mandate

Ship interfaces that feel machined and intentional—not template-plus-font swaps. Vary layout archetype and texture profile per project while staying in a refined “product-marketing elite” language (deep blacks, diffused light, editorial type, spring-based motion).

## Hard anti-patterns

Instant fail if present by default:

- System sans defaults: Inter, Roboto, Arial, Open Sans, Helvetica as the hero voice
- Heavy generic icon sets with chunky strokes; prefer light precise strokes (Phosphor Light, Remix Line style)
- Flat gray 1px borders and harsh `shadow-md`-style drops
- Edge-glued full-width nav with no breathing room; symmetric three-column Bootstrap grids without whitespace tension
- `linear` / plain `ease-in-out` as the only motion language

## Variance engine (pick once per page)

**Texture / vibe (one):**

1. **Deep glass tech** — near-OLED base (`#050505`), subtle radial mesh orbs, frosted panels with white/10 hairlines, wide grotesk display type
2. **Editorial luxury** — warm paper (`#FDFBF7`), muted sage or espresso, variable serif headlines, film grain at ~3% opacity
3. **Soft structural** — silver or white field, bold grotesk, floating modules with ultra-diffuse ambient shadow

**Layout (one):**

1. **Asymmetric bento** — mixed `col-span` / `row-span`; mobile → single column, spans reset
2. **Z-axis cascade** — stacked cards with slight rotation/overlap; mobile → no overlap, vertical stack
3. **Editorial split** — half-width type, half interactive gallery or pill strip; mobile → type block then content

Universal mobile: below 768px use `w-full`, `px-4`, `py-8`; full height via `min-h-[100dvh]`.

## Component craft

**Double-bezel nesting:** Outer shell (muted fill, hairline ring, padding `p-1.5`–`p-2`, large radius e.g. `rounded-[2rem]`). Inner core (distinct fill, inset highlight, inner radius `calc(outer − padding)`).

**Primary CTAs:** Full pill buttons; trailing arrow lives inside its own nested circle flush to the inner edge, not floating beside label.

**Spatial rhythm:** Section padding at least `py-24`, often `py-32`–`py-40`. Optional microscopic eyebrow pill before major headings (`text-[10px] uppercase tracking-[0.2em]`).

## Motion choreography

Custom easing e.g. `cubic-bezier(0.32, 0.72, 0, 1)` over 700ms+. Floating nav pill detached from top (`mt-6`, `rounded-full`, `w-max`). Hamburger morphs to X with rotated lines, not vanish. Menu overlay: heavy blur + staggered link rise (`translate-y-12` → `0`). Buttons: slight press on active; inner icon circle shifts diagonally on group hover. Scroll entry: fade-up from blur (`translate-y-16 blur-md opacity-0` → clear) over 800ms+; use `IntersectionObserver` or Motion `whileInView`, not raw scroll listeners.

## Performance

Transform and opacity only for animation. `backdrop-blur` on fixed/sticky layers only—not scrolling bodies. Noise on fixed, non-interactive overlay. Z-index reserved for nav, modal, overlay, tooltip tiers.

## Execution sequence

1. Select vibe + layout archetypes silently
2. Scaffold background texture, macro spacing, display scale
3. Build major surfaces with double-bezel and squircle radii (~`2rem`)
4. Inject easing, nav reveal, button-in-button physics
5. Ship complete implementation—no skeleton placeholders

## Pre-output checks

- Banned patterns absent; archetypes applied deliberately
- Major cards use nested shell/core; CTAs use nested icon treatment where arrows exist
- Section padding ≥ `py-24`; custom beziers everywhere
- Scroll entries present; mobile collapse clean
- Blur scope correct; overall reads bespoke agency, not theme demo
