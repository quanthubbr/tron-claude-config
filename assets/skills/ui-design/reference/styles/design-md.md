# DESIGN.md format

Use when authoring or updating a project `DESIGN.md` so agents and the ui-design engine share one semantic design-system document (visual atmosphere, tokens, components, motion intent, bans).

## Purpose

`DESIGN.md` is the single source of truth for how new screens should look and behave before code exists. Write in natural language **plus** exact values (hex, rem, px, spring constants). Name colors by role, not only hue.

## Authoring workflow

1. **Atmosphere** — Mood, density, variance, motion intent on 1–10 scales; default creative baseline often variance 8, motion 6, density 4 unless the product demands calm or cockpit modes  
2. **Palette** — Named swatches with hex and role; max one accent (<80% saturation); off-black not `#000`; ban default violet-neon slop; one gray temperature  
3. **Typography** — Display, body, mono stacks; scale via `clamp`; Inter discouraged for premium marketing; serif only with editorial justification; dashboards sans+mono; density >7 → mono numerals  
4. **Hero** — Inline image typography allowed at high variance; no overlap clutter; no scroll-hint chrome; asymmetric when variance >4; one primary CTA  
5. **Components** — Buttons (tactile active), cards (only if elevation matters), forms (label above, error below), nav, loaders (skeleton not spinner), empty/error patterns  
6. **Layout** — Grid-first, max-width ~1400px, `min-h-[100dvh]`, no three equal feature columns, no flex `%` hacks, clean spatial separation  
7. **Responsive** — Collapse to one column <768px; no horizontal overflow; 44px touch targets; test 375 / 768 / 1440  
8. **Motion (intent)** — Spring `stiffness: 100`, `damping: 20`; staggered mounts; perpetual micro-loops only where live UI warrants; transform/opacity only; grain on fixed layers  
9. **Anti-patterns** — Explicit NEVER list (emojis, generic fonts, pure black, neon glow, 3-col cards, placeholder names, hype copy, broken images, default component library skin, `h-screen`, spinners)

## DESIGN.md format template

```markdown
# Design System: [Project Title]

## 1. Visual Theme & Atmosphere
(Evocative paragraph: density, variance, motion levels, emotional read.)

## 2. Color Palette & Roles
- **Name** (#HEX) — functional role
(One accent max; banned hues noted.)

## 3. Typography Rules
- **Display:** family, tracking, scale, weight hierarchy
- **Body:** family, leading, max measure, secondary color
- **Mono:** usage rules
- **Banned:** fonts/contexts

## 4. Component Stylings
* Buttons, cards, inputs, navigation, loaders, empty/error — shape, color, shadow, interaction

## 5. Layout Principles
(Grid, asymmetry rules, containment, hero/feature patterns.)

## 6. Motion & Interaction
(Spring defaults, stagger, loops, performance isolation.)

## 7. Anti-Patterns (Banned)
(Explicit list aligned with ui-design direction module.)
```

Optional dial table at top when projects tune creativity/density/variance/motion explicitly.

## Quality bar

- Descriptive names tied to function (“Charcoal Ink” not “dark gray”)  
- Every swatch has hex (or rgba) and role  
- Consistent terminology across sections  
- Opinionated—neutral “any style” docs fail agents  
- Anti-pattern section as long as rules section—bans prevent regression  

## Pitfalls

- Tailwind class names without human-readable translation  
- Names without hex  
- Vague atmosphere with no measurable tokens  
- Omitting responsive and motion intent  
- Safe generic aesthetics that contradict premium direction  

Engine artifacts (`DESIGN.md`, `PRODUCT.md`, the engine state directory) use literal paths and names the ui-design CLI expects—do not rename those files when following this format.
