# Art direction (marketing & editorial UI)

Use when building landing pages, portfolios, marketing sites, or editorial surfaces under `ui-design`; dashboards and dense product tools follow **ui-design Operate mode** instead of this module.

## Read the brief first

Before code or dial tuning, infer intent from: page type, vibe words, references, audience, existing brand assets, and hard constraints (accessibility, regulated sectors, trust-first commerce). State a single-sentence **design read** naming page type, audience, mood, and whether you will lean on an official system or a custom aesthetic. If the brief truly forks (e.g. minimal vs experimental), ask **one** question; otherwise publish the read and proceed.

Reject LLM defaults: violet mesh heroes, centered dark gradients, three equal feature cards, glass on everything, infinite micro-loops on every tile, Inter + slate-900 as the whole identity.

## Three tunable dials

Global variables—use these names only:

| Dial | Default | Meaning |
|------|---------|---------|
| `DESIGN_VARIANCE` | 8 | 1 symmetric grids → 10 chaotic asymmetry |
| `MOTION_INTENSITY` | 6 | 1 static → 10 cinematic scroll choreography |
| `VISUAL_DENSITY` | 4 | 1 gallery whitespace → 10 cockpit data packing |

Override from the design read (examples): calm product-marketing pages dial variance and motion down and density slightly up; experimental agency pages push variance and motion high while keeping density moderate; civic or compliance sites favor low motion and predictable grids; when refreshing an existing brand without a visual reboot, keep variance and density near what you audited and nudge motion up one step; full visual reboots bump variance and motion two steps while holding density steady.

### Dial behavior (quick reference)

**Variance:** 1–3 symmetrical 12-col grids; 4–7 overlaps, mixed aspect ratios; 8–10 masonry, `2fr 1fr 1fr`, large empty zones. Above `md`, asymmetric layouts must collapse to single column (`w-full`, `px-4`, `py-8`) below 768px.

**Motion:** 1–3 hover/active only; 4–7 CSS transitions `cubic-bezier(0.16, 1, 0.3, 1)` on transform/opacity; 8–10 scroll-linked reveals via Motion, GSAP ScrollTrigger, or CSS scroll-driven animations—never `window` scroll listeners in React state.

**Density:** 1–3 huge section gaps (`py-32`–`py-48`); 4–7 standard marketing rhythm; 8–10 tight padding, dividers not cards, monospace for all numeric readouts.

## Foundation choice

When the brief matches an official design system (Fluent, Carbon, Material Web, Polaris, Atlaskit, Primer, GOV.UK, USWDS, Radix Themes, shadcn with customization), install and use it—do not hand-clone its CSS. One system per project. For aesthetic-only briefs (bento, editorial, brutalist, glass, kinetic type), build with Tailwind + native CSS + Motion; label approximations honestly (e.g. web “glass” is not a platform-native material).

## Stack defaults (when no system wins)

React/Next with RSC; interactivity in isolated `'use client'` leaves. Tailwind v4 unless the repo is v3-locked. Motion from `motion/react`; continuous pointer/scroll values via `useMotionValue` / `useTransform` / `useScroll`, not `useState` per frame. Verify `package.json` before any new dependency; print install commands when missing. Icons: Phosphor, HugeIcons, Radix, or Tabler—one family, fixed stroke width; no hand-drawn SVG icons. Fonts via `next/font` or self-hosted `@font-face`. Page shell: `max-w-[1400px]` or `max-w-7xl`; full viewport height uses `min-h-[100dvh]`, never `h-screen`. Structure with CSS Grid, not flex percentage hacks.

## Typography

Display default: tight tracking, controlled scale (`text-4xl md:text-6xl` as a starting point—not a mandate to shout). Body: ~65ch, relaxed leading, muted secondary color. Discourage Inter as the default sans; prefer Geist, Outfit, Cabinet Grotesk, Satoshi unless the brief wants neutral/system UI. Serif is **not** the default “creative” move—use sans display unless the brand or editorial brief justifies serif; never default Fraunces/Instrument Serif; no random serif word inside a sans headline (use italic/bold of the same family). Dashboards and software chrome: sans + mono only. Italic display with descenders (`y g j p q`): minimum `leading-[1.1]` and bottom padding reserve.

## Color

One accent, saturation under 80% unless brand dictates. Neutral bases (zinc/slate/stone); ban the generic “AI violet glow” default—purple is fine when the brand owns it. Lock one gray temperature per project. No pure `#000000`; use off-black. Premium-consumer briefs: rotate palette families—do not default to warm cream + brass + oxblood + espresso on every artisan brief.

## Layout & hero

When `DESIGN_VARIANCE > 4`, avoid centered hero monoliths; prefer split, left-weighted, or asymmetric whitespace. Hero must fit first viewport: headline ≤2 lines desktop, subcopy ≤20 words and ≤4 lines, primary CTA visible without scroll; top padding cap ~`pt-24` desktop; max four hero text layers (optional eyebrow, headline, subtext, CTAs)—no logo walls, pricing teasers, or feature lists inside hero. Trust logos sit in the next section. Nav: one line at desktop, height ≤80px. Wide headline containers so H1 stays 2–3 lines, not six (`max-w-5xl`–`6xl`, sensible `clamp`). Section layout families: each family at most once per page; max two consecutive image/text zigzags; bento cell count equals content count (`grid-flow-dense`, no dead cells); eyebrows capped at one per three sections (count `uppercase tracking` micro-labels). No split-header default (big left title + tiny right paragraph). Page theme: one light/dark/auto for the whole scroll—no random inverted band mid-page.

## AIDA & page rhythm (marketing flows)

Structure long pages as chapters with generous vertical padding (`py-32 md:py-48`): **Attention** (hero + nav), **Interest** (features/bento), **Desire** (scroll media, pinned galleries), **Action** (pricing/footer CTA). Wrap root in `overflow-x-hidden` when horizontal motion exists.

## Variance without repetition

Before implementation, commit to a deterministic layout pick (seed from brief length or hash) so consecutive outputs do not clone: one hero archetype, one type stack, several component patterns, two motion paradigms. Banned cheap chrome: meta labels like “SECTION 01”, “QUESTION 05”, scroll-chevrons, duplicate contact CTAs on one page, wrapped primary button labels at desktop.

## Motion rules

If `MOTION_INTENSITY > 4`, ship visible motion (hero enter, section reveals, CTA hover)—or lower the dial and stay static. Every animation needs a one-sentence purpose (hierarchy, story, feedback, state). Max one horizontal marquee per page. GSAP pin/scrub: `start: "top top"`, cleanup in `useEffect`. Honor `prefers-reduced-motion` for intensity >3. No mixing GSAP/Three with Motion in one component tree. Spring default when using Motion: `stiffness: 100`, `damping: 20`. Grain/noise only on fixed `pointer-events-none` overlays.

## States & forms

Ship loading (layout-matched skeletons), empty, error, hover, active (`scale-[0.98]` or slight translate), and focus rings. Labels above inputs; errors below; WCAG AA contrast on buttons and forms. One primary label per intent sitewide (“contact”, “signup”, “portfolio”).

## Assets

Landings are visual: prefer project image tools, then seeded placeholder photography (`picsum.photos/seed/{topic}/{w}/{h}`), never div-built fake dashboards. Logo walls use real SVG marks (e.g. simple-icons CDN) or invented monogram SVGs—not plain text faux logos; no category subtitles under logos. Minimal briefs still need real photography in key slots.

## Content bans

No em-dash or en-dash as prose punctuation—hyphen or restructure sentences. No generic names, Acme-style brands, filler verbs (“elevate”, “seamless”, “unleash”), fake round stats, version stamps in hero, section-number eyebrows, locale/weather strips, scroll hints, pills on photos, decorative photo credits, v1.4.2 footers on marketing pages, or Jane-Doe avatars. Quotes ≤3 lines; clean attribution. Copy self-audit: fix broken or “performed humility” strings.

## AI visual tells (summary)

Neon outer glows, gradient-filled giant headlines, custom cursors, three equal feature columns, hand-rolled decorative SVGs, broken stock URLs, default shadcn skin, decorative status dots, filled progress-bar comparisons, long spec tables with a hairline on every row—replace with grouped specs, cards, or disclosures.

## Performance & a11y

Animate transform/opacity only. Dark mode designed up front with paired tokens. Target LCP <2.5s, INP <200ms, CLS <0.1. Document z-index layers; do not spam arbitrary high z-index. Cards only when elevation means hierarchy; tint shadows to background hue; one radius system per page.

## Internal plan (before UI code)

Document briefly: chosen dials and why; AIDA sections present; hero width/line math; bento grid coverage; label/button contrast sweep; motion list with purpose; reduced-motion path. Then implement.

## Pre-delivery checklist

- Design read stated; dials explicit; system or aesthetic named; redesign audited if brownfield
- Zero em-dashes; single page theme; locked accent and radius system
- Hero viewport, nav, eyebrow, zigzag, CTA, and form contrast rules pass
- Bento/images/logos/marquee/motion/GSAP rules pass; no scroll listeners in state
- Mobile collapse, `min-h-[100dvh]`, cleanup on effects, empty/load/error states
- Content and Section 9-style tells absent; dependencies verified; one icon family
- Dashboards/tools: stop—use Operate mode and official dense UI systems instead
