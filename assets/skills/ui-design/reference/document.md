# Document

Produce root **`DESIGN.md`**: machine-readable tokens plus human guidance so new UI stays on-brand.

**Format:** optional YAML frontmatter (normative tokens) + up to eight markdown sections in fixed order. Prose explains usage; **frontmatter wins** on conflicts.

## Frontmatter schema

```yaml
---
name: <project title>
description: <one-line tagline>
colors:
  primary: "#b8422e"
  neutral-bg: "#faf7f2"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2.5rem, 7vw, 4.5rem)"
    fontWeight: 300
    lineHeight: 1
rounded:
  sm: "4px"
spacing:
  md: "16px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.neutral-bg}"
    rounded: "{rounded.sm}"
    padding: "16px 48px"
---
```

**Rules:**

- Token refs: `{colors.primary}`, `{rounded.md}` — components may reference primitives; primitives never reference each other.
- Colors: any valid CSS string; preserve incumbent `oklch()` / `hsl()` when normative.
- Component entries: max eight props — `backgroundColor`, `textColor`, `typography`, `rounded`, `padding`, `size`, `height`, `width`. Shadows, motion, focus rings → sidecar.
- Scale names follow the project (`oxblood-deep`, not forced Material names).
- Variants as sibling keys: `button-primary-hover`, etc.

## Body sections (exact headings, this order)

1. `## Overview` — north star metaphor, philosophy, key characteristics
2. `## Colors` — roles (primary/secondary/tertiary/neutral), named rules
3. `## Typography` — stacks, hierarchy, named rules
4. `## Layout` — grid, containers, rhythm, responsive behavior
5. `## Elevation & Depth` — shadows or tonal layering
6. `## Shapes` — radius, borders, silhouettes
7. `## Components` — per-component behavior and states
8. `## Do's and Don'ts` — durable guardrails

Omit empty sections; never rename headers tooling parses.

## When to run

- Coherent incumbent system, no `DESIGN.md`
- First build of a new world needs carbonizing
- Stale `DESIGN.md` vs code
- Pre-redesign snapshot

Existing file → show user; AskUserQuestion: refresh, overwrite, or merge.

## Paths

| Mode | When |
|------|------|
| **Scan** (default) | Tokens/components/rendered UI exist |
| **Seed** | Pre-code; needs `PRODUCT.md` + new-work workshop |

`/ui-design document --seed` runs workshop—it does **not** replace coherent code; identity replacement goes through new-work.

## Scan mode

### Step 1 · Discover assets (priority order)

1. **CSS variables** — grep `--color-`, `--font-`, `--spacing-`, `--radius-`, `--shadow-`, `--ease-`, `--duration-` in stylesheets; record name, value, defining file.
2. **Tailwind** — `tailwind.config.*` → `theme.extend` colors, fonts, spacing, radii, shadows.
3. **CSS-in-JS themes** — `theme.ts`, `tokens.ts`, etc.
4. **Token JSON** — Style Dictionary / W3C community formats.
5. **Component library** — button, card, input, nav, dialog variants.
6. **Global CSS** — base type and color assignments.
7. **Live sample** (optional) — computed styles on body, headings, links, buttons, cards.

### Step 2 · Structured draft

- **Colors:** primary/secondary/tertiary/neutral roles; omit empty roles.
- **Typography:** display/headline/title/body/label mapping + scale ratio.
- **Elevation:** shadow vocabulary or explicit flat/tonal system.
- **Components:** shape, color, hover/focus, padding per common primitive.
- **Layout / shapes:** grid, breakpoints, rhythm, radius language.

### Step 2b · Stage frontmatter

One slug per color; typography objects with real props only; component variants using `{token}` refs; overflow props → sidecar.

### Step 3 · Qualitative rounds

Two rounds, ≤3 questions each (wait between): Creative North Star metaphor; overview voice; descriptive color names; elevation philosophy; component feel. Pull from `PRODUCT.md` only binding brand constraints.

### Step 4 · Write DESIGN.md

Frontmatter + canonical sections. Use **Named Rules**: `**The [Name] Rule.**` one-line doctrine. Lead with descriptive language; put exact values in parentheses.

### Step 4b · Sidecar `.impeccable/design.json`

Extensions only — not a duplicate of frontmatter primitives.

```json
{
  "schemaVersion": 2,
  "generatedAt": "ISO-8601",
  "title": "Design System: [Project Title]",
  "extensions": {
    "colorMeta": {
      "primary": {
        "role": "primary",
        "displayName": "Editorial Magenta",
        "canonical": "oklch(60% 0.25 350)",
        "tonalRamp": ["...", "..."]
      }
    },
    "typographyMeta": {
      "display": { "displayName": "Display", "purpose": "Hero headlines only." }
    },
    "shadows": [
      { "name": "ambient-low", "value": "0 4px 24px rgba(0,0,0,0.12)", "purpose": "Hover glow under accents." }
    ],
    "motion": [
      { "name": "ease-standard", "value": "cubic-bezier(0.4, 0, 0.2, 1)", "purpose": "Default transition easing." }
    ],
    "breakpoints": [
      { "name": "sm", "value": "640px" }
    ]
  },
  "components": [
    {
      "name": "Primary Button",
      "kind": "button",
      "refersTo": "button-primary",
      "description": "One-line when-to-use.",
      "html": "<button class=\"ds-btn-primary\">SAVE</button>",
      "css": ".ds-btn-primary { ... expanded literal CSS ... }"
    }
  ],
  "narrative": {
    "northStar": "...",
    "overview": "...",
    "keyCharacteristics": ["..."],
    "rules": [{ "name": "The One Voice Rule", "body": "...", "section": "colors" }],
    "dos": ["Do ..."],
    "donts": ["Don't ..."]
  }
}
```

**schemaVersion 2:** primitives live in YAML frontmatter; sidecar holds ramps, shadows, motion, breakpoints, full HTML/CSS snippets, narrative mirror.

**Component snippet rules:** expand Tailwind to literal CSS; use `var(--token)` when tokens live on `:root`; inline SVG icons; include `:hover` and `:focus-visible`; prefix classes `ds-`; skip global resets.

Include **5–10** representative components; synthesize primitives on day-zero if needed. Tonal ramps ~8 steps OKLCH unless project defines a scale. Map narrative fields from DESIGN.md without rewording (panel copy).

Regenerate sidecar whenever DESIGN.md regenerates; refresh sidecar alone when user asks—keep DESIGN.md untouched.

### Step 5 · Confirm

Show DESIGN.md; note sidecar for live panel; offer section revisions.

## Seed mode

1. Missing `PRODUCT.md` → [init.md](init.md). Else [new-work.md](new-work.md) through world workshop + **Commit the world** for named first surface—stop at seed + surface brief.
2. Write seed with marker:

```markdown
<!-- SEED: established before implementation; re-run /ui-design document after code exists. -->
```

Minimal frontmatter (`name`, `description` only). Sections carry thesis; placeholders `[to be resolved during implementation]` for unknown tokens. **Components** omitted. No sidecar until scan.

3. Confirm seed status; user re-runs document after implementation.

## Section-by-section scan guidance

| Section | Capture |
|---------|---------|
| **Overview** | North star metaphor, 2–3 paragraphs on personality/density, **Key Characteristics** bullets, confirmed anti-references only |
| **Colors** | Role groups, descriptive names, where/why each swatch appears, optional **Named Rules** (≤10% accent doctrine, etc.) |
| **Typography** | Display/body/label stacks, hierarchy ladder with weights/sizes/line-height, measure guidance (e.g. 65–75ch body) |
| **Layout** | Grid model, max widths, breakpoint behavior, vertical rhythm—observed values in parentheses |
| **Elevation & Depth** | Shadow tokens or explicit flat/tonal strategy; shadow vocabulary list if applicable |
| **Shapes** | Radius language, borders, clipping habits, recurring silhouettes |
| **Components** | Buttons, inputs, nav, chips, cards—character line plus states (hover/focus/error) |
| **Do's and Don'ts** | Lead with **Do** / **Don't**; ground in incumbent code, not one-off page choices |

### Overview — writing template

Open with a metaphor that explains *why* the UI feels the way it does (studio bench, editorial desk, instrument panel). Follow with density stance (airy vs packed), motion temperament, and trust posture. **Key Characteristics** = 4–7 bullets a new contributor could verify in code. Anti-references only when the user or `PRODUCT.md` named them—never invent rival brands.

### Colors — writing template

Group swatches by **role**, not file order: primary action, secondary/support, neutrals (bg/surface/border), semantic (success/warn/danger). Give each swatch a **display name** in prose; park exact values in frontmatter or parentheses. Named Rules encode doctrine (`**The Restraint Rule.**` one sentence). Document dark-mode pairs when observed.

### Typography — writing template

Map roles: display, headline, title, body, label, mono (if any). For each: family stack, weight habit, size step, line-height, letter-spacing if distinctive. Note measure targets and when to avoid display faces in dense tables.

### Layout — writing template

Describe grid (columns, gutters, max content width), sticky regions, scroll behavior, and breakpoint flips. Quote observed spacing steps from `--spacing-*` or Tailwind scale. Call out full-bleed vs contained sections.

### Elevation & Depth — writing template

Either list shadow tokens with intent (hover vs modal) or declare a **flat/tonal** system using surface steps only. Sidecar `extensions.shadows` holds long values; prose explains when to use each tier.

### Shapes — writing template

Radius ladder (`--radius-*`), border weights, pill vs square buttons, clip habits. Tie shapes to brand metaphor where helpful.

### Components — writing template

One subsection per primitive: purpose, anatomy, default + hover + focus + disabled + error. Reference frontmatter keys (`button-primary`) instead of duplicating hex. Sidecar may carry expanded HTML/CSS snippets for live panel consumers.

### Do's and Don'ts — writing template

Minimum six lines, balanced. Each **Do** ties to an observed good pattern; each **Don't** blocks a regression you saw in code or critique—not hypothetical trends.

---

## Token discovery grep cheatsheet

When scanning CSS sources, prioritize prefixes (record file + line):

| Prefix | Typical meaning |
|--------|-----------------|
| `--color-*` | Semantic and brand fills |
| `--radius-*` | Corner language |
| `--spacing-*` | Rhythm scale |
| `--shadow-*` | Elevation |
| `--ease-*` | Motion curves |
| `--duration-*` | Transition timing |
| `--font-*` | Family/size shortcuts when present |

Tailwind: mine `theme.extend` for the same roles. CSS-in-JS: flatten nested theme objects into the frontmatter schema.

---

## Sidecar vs frontmatter split

| Lives in YAML frontmatter | Lives in `.impeccable/design.json` |
|---------------------------|-------------------------------------|
| Primitive colors, type scales, radii, spacing keys | Tonal ramps, extra shadow/motion/breakpoint entries |
| Up to 8 props per component variant | Full HTML/CSS exemplars, `refersTo` linkage |
| `{token}` references among components | `narrative` mirror (northStar, rules, dos/donts) |

Regenerate both together on full document runs; `--sidecar-only` refresh (user request) touches JSON without rewriting DESIGN.md body.

---

## Scan workflow timing

1. **Discover** — run grep/Tailwind/token JSON passes; dedupe by token name.
2. **Draft frontmatter** — primitives first, then component variants referencing them.
3. **Qualitative rounds** — two passes, ≤3 questions each; wait for answers between passes.
4. **Write DESIGN.md** — canonical section order; Named Rules where doctrine helps.
5. **Emit sidecar** — mirror narrative fields verbatim; expand components to literal CSS.
6. **Confirm** — show user both files; offer section-level revision loop.

On **seed** runs, stop after placeholder sections—no sidecar until a post-implementation scan replaces `[to be resolved…]` markers.

## Style & pitfalls

Frontmatter normative—no duplicate hex in prose. Named Rules 1–3 per section where useful. No raw class dumps. No top-level frontmatter groups for motion/breakpoints/shadows (sidecar only). Do not invent components; do not silently overwrite existing DESIGN.md. Do not rename canonical section headers.
