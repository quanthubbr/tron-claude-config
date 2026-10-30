# Brownfield redesign

Use when upgrading an existing site or app without a full greenfield rewrite—audit first, then targeted visual and UX fixes on the current stack.

## Workflow

1. **Scan** — Framework, CSS approach (Tailwind, modules, vanilla), recurring patterns, component library
2. **Diagnose** — List generic AI tells, weak hierarchy, missing states, broken links, perf traps
3. **Fix** — Incremental improvements; preserve behavior and routes unless explicitly changing IA

## Audit dimensions

### Typography

Replace default/Inter-only stacks with character (Geist, Outfit, Cabinet Grotesk, Satoshi); editorial may pair serif display + sans body. Strengthen headlines (size, tracking, leading); cap body ~65ch; add Medium/Semibold steps; tabular nums or mono for metrics; balance/wrap orphans; reduce gratuitous ALL CAPS eyebrows.

### Color & surfaces

Off-black instead of `#000`; one desaturated accent; consistent gray temperature; remove violet “AI product” gradients; tint shadows to background; add subtle grain or mesh; avoid lone dark band on light page; add low-opacity photography or pattern where sections feel empty.

### Layout

Break center symmetry; kill three equal feature columns (zig-zag, bento, horizontal scroll); `min-height: 100dvh` not `100vh`; grid not flex `%` hacks; max-width ~1200–1440px; variable card heights; varied radii; overlap for depth; optical padding; alternate nav patterns for dashboards; double spacing on marketing pages; align CTAs in card grids; align feature list baselines in pricing columns.

### Interactivity

Hover/active/focus on all controls; 200–300ms transitions; skeleton loaders; composed empties; inline form errors; real hrefs; active nav state; smooth anchor scroll; animate transform/opacity only.

### Content

Realistic names and messy numbers; contextual brand names; ban hype adjectives; direct errors; active voice; varied dates; unique avatars; no lorem; sentence-case headings.

### Components & icons

Cards only when hierarchy needs elevation; diversify button styles; rethink pill “New” badges; FAQ alternatives; testimonial layouts beyond three-card carousel; pricing emphasis by color not height; inline edit vs modal spam; squircle avatars; theme control beyond sun/moon cliché; simplify footers.

### Code & SEO hygiene

Semantic landmarks; styling in design system not inline; relative units; alt text; z-index scale; remove dead code; verify imports; meta/OG tags; legal links; back navigation; custom 404; validation; skip link; cookie banner if required.

## Upgrade levers (impact order)

1. Font swap  
2. Palette cleanup  
3. Hover/active layer  
4. Grid, max-width, spacing  
5. Replace cliché components  
6. Loading/empty/error  
7. Type scale polish  

Advanced swaps when justified: variable font motion, text masks, broken grid, parallax stacks, split scroll, spring motion, scroll-driven masks, true glass edges, spotlight borders, grain overlays, tinted shadows.

## Rules

- Keep stack and dependencies; check Tailwind major version before config edits  
- No silent URL, nav label, form field, logo, or legal copy changes  
- Test after each batch; small reviewable diffs  
- For preserve-mode redesigns, extract brand tokens before applying global direction rules  
- SEO: preserve slugs, titles, and structured data unless migration is explicit  
