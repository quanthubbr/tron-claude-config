> **Additional context needed**: target platforms/devices and usage contexts.

Carry an existing design into another context—viewport, device, platform, or use case. Adaptation is not uniform scaling; rethink for the new environment.

**Web only** (mobile web included). Native (`ios` / `android` / `adaptive`) → [adapt.native.md](adapt.native.md) now if the project is native.

---

## Assess

1. **Source context:** original target (desktop? mobile?); assumptions (large screen, mouse, fast net); what already works.
2. **Target:** device; input (touch/mouse/keyboard/voice); screen size/orientation; connection; usage (glance vs deep read); platform expectations.
3. **Friction:** what won’t fit, won’t work (hover on touch, tiny targets), or feels wrong (desktop patterns on phone).

**CRITICAL:** Rethink the experience—don’t scale pixels.

## Strategy sketches

### Desktop → mobile

Layout: single column, vertical stack, full-width, bottom nav vs top/side.

Interaction: 44×44px targets; swipe where natural; bottom sheets; thumb reach; spacing.

Content: progressive disclosure; primary first; shorter/larger type (16px min).

Nav: hamburger or bottom bar; simpler IA; sticky context; explicit back.

### Tablet

Two-column hybrid; side panels; master-detail; orientation-aware density; touch + pointer; 44px targets but denser than phone.

### Mobile → desktop

Multi-column; persistent side nav; multiple panels; max-width (don’t stretch to 4K).

Hover for extra info; shortcuts; context menus; drag-drop; multi-select.

More upfront detail; wide tables; richer viz.

### Print

Logical page breaks; strip nav/footer/interaction; B&W or limited color; binding margins; expand shortened content; page headers/footers; print-friendly charts.

### Email

~600px width; single column; inline CSS; table layout for clients; large CTAs; no hover; deep links for complex flows.

## Implement

Breakpoints (typical): mobile 320–767; tablet 768–1023; desktop 1024+—or content-driven breaks.

Techniques: Grid/Flex reflow; container queries; `clamp()`; media queries; show/hide per context.

Touch: larger targets; spacing; replace hover-only paths; touch feedback; thumb zones.

Content: avoid heavy `display:none` downloads; progressive enhancement; lazy load; responsive images (`srcset`, `picture`).

Nav: drawer/hamburger mobile; bottom bar apps; persistent desktop side nav; breadcrumbs on small screens.

Test real devices—DevTools emulation is incomplete.

**NEVER:** hide core mobile functionality; assume desktop = powerful; different IA per context; ignore landscape; blind generic breakpoints; ignore desktop touch.

## Verify

Real devices; orientations; major browsers; OS variants; touch/mouse/keyboard; 320px and 4K edges; throttled network.

Then `/ui-design polish`.

---

## Responsive reference (inline)

### Mobile-first

Base styles for small screens; `min-width` layers complexity. Desktop-first loads unused CSS first.

### Content-driven breakpoints

Stretch until layout breaks; add breakpoint there. Often 640/768/1024 suffices. `clamp()` for fluid values.

### Input method ≠ screen size

Use pointer/hover queries:

```css
@media (pointer: fine) {
  .button { padding: 8px 16px; }
}
@media (pointer: coarse) {
  .button { padding: 12px 20px; }
}
@media (hover: hover) {
  .card:hover { transform: translateY(-2px); }
}
@media (hover: none) {
  .card { /* active, not hover */ }
}
```

Never require hover for core tasks.

### Safe areas

```css
body {
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
}
.footer {
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}
```

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

### Responsive images

```html
<img
  src="hero-800.jpg"
  srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Hero image"
>
```

Art direction:

```html
<picture>
  <source media="(min-width: 768px)" srcset="wide.jpg">
  <source media="(max-width: 767px)" srcset="tall.jpg">
  <img src="fallback.jpg" alt="...">
</picture>
```

### Patterns

Nav: drawer → compact horizontal → full labeled desktop. Tables: card stack on small screens via `display:block` + `data-label`. Progressive disclosure: `<details>/<summary>`.

### Testing

Emulation misses touch, real CPU/memory, latency, fonts, browser chrome/keyboard. Test at least one iPhone, one Android; cheap Android exposes perf simulators hide.

**Avoid:** desktop-first; device sniffing vs feature detection; split mobile/desktop codebases; ignoring tablet/landscape; assuming all phones are fast.
