# Web animation — build sequence & recipes

Construction skill: turn a motion request into implementation that passes review. Not for codebase audits (`reference/review.md`) or RN (`reference/expo.md`). For overlays (toast, drawer, menu) consider `reference/ui-libraries.md` before hand-rolling.

## Posture

Make the call; one line of reasoning; ship code. Worst failure: animating what should stay instant. Second: right moment, wrong curve, keyframes on a stack, `scale(0)`.

## Hard rules

1. Run steps 1–2 before tools or curves.
2. Use table values — no invented beziers.
3. Extend existing `--ease-*` / duration tokens; do not fork a parallel scale.
4. Ship reduced-motion and hover gating with the change.
5. Cheapest tool: CSS fade beats installing Motion.

## Build sequence

### 1–2. Gate & purpose

Same frequency and purpose tables as `SKILL.md`. Keyboard-initiated → stop with instant UI alternative.

### 3. Tool (first fit)

| Need | Tool |
| --- | --- |
| Class/attribute toggles | CSS transition |
| Mount entry, no JS | `@starting-style` |
| Predetermined motion under load | CSS `@keyframes` / animation |
| JS control, CSS perf | WAAPI `element.animate()` |
| Springs, layout, exit, gestures | Motion (`motion.dev`) |

### 4. Properties

- `transform` + `opacity`; `clip-path` when recipe says so; `height` only for accordions.
- No `scale(0)` entrances.
- Trigger-anchored surfaces: `transform-origin: var(--transform-origin)`.
- `translateY(100%)` = one element height — prefer over px.
- Motion: full `transform` string, not `x`/`y` shorthands under load.

### 5. Easing, duration, springs

Follow `SKILL.md` tokens and duration table.

Springs when: drag momentum, alive feel, interruptible gesture, decorative pointer tracking.

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

Bounce 0.1–0.3; reserve visible bounce for dismiss/playful cases.

### 6. Interruption & exit

Transitions (or springs) for rapid fire; symmetric enter/exit paths for dismiss surfaces; slow deliberate press, fast release (hold-to-confirm pattern).

### 7. A11y

`prefers-reduced-motion` + `@media (hover: hover) and (pointer: fine)` for hover motion.

## Never ship

| Avoid | Use |
| --- | --- |
| `transition: all` | Named properties |
| `scale(0)` enter | `scale(0.95)` + opacity |
| `ease-in` on UI | ease-out + strong bezier |
| Keyframes on toasts/toggles | Transitions |
| Motion x/y under load | `transform` string |
| Ungated hover | fine-pointer media query |

## Recipes

Tokens: `--ease-out`, `--ease-in-out`, `--ease-drawer` from sequence above.

### Press feedback

```css
.tap-target {
  transition: transform 160ms var(--ease-out);
}
.tap-target:active {
  transform: scale(0.97);
}
```

### Popover / menu / select

```css
.floating-panel {
  transform-origin: var(--transform-origin);
  transition:
    opacity 200ms var(--ease-out),
    transform 200ms var(--ease-out);
}
.floating-panel[data-starting-style],
.floating-panel[data-ending-style] {
  opacity: 0;
  transform: scale(0.95);
}
```

### Tooltip

```css
.hint {
  transform-origin: var(--transform-origin);
  transition:
    transform 125ms var(--ease-out),
    opacity 125ms var(--ease-out);
}
.hint[data-starting-style],
.hint[data-ending-style] {
  opacity: 0;
  transform: scale(0.97);
}
.hint[data-instant] {
  transition-duration: 0ms;
}
```

### Modal (centered origin)

```css
.dialog {
  transform-origin: center;
  transition:
    opacity 250ms var(--ease-out),
    transform 250ms var(--ease-out);
}
.dialog[data-starting-style],
.dialog[data-ending-style] {
  opacity: 0;
  transform: scale(0.96);
}
.scrim {
  transition: opacity 250ms var(--ease-out);
}
```

### Drawer

```css
.sheet {
  transform: translateY(0);
  transition: transform 500ms var(--ease-drawer);
}
.sheet[data-closed] {
  transform: translateY(100%);
}
```

### Toast

```css
.notice {
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 400ms ease,
    transform 400ms ease;

  @starting-style {
    opacity: 0;
    transform: translateY(100%);
  }
}
```

Fallback mount flag if `@starting-style` unavailable:

```jsx
useEffect(() => { setVisible(true); }, []);
// data-visible on root
```

### Accordion

```css
.panel-body {
  overflow: hidden;
  transition:
    height 200ms var(--ease-out),
    opacity 200ms var(--ease-out);
}
```

Measure height in JS — do not animate to `auto` blindly.

### Stagger (occasional lists)

```css
.row {
  opacity: 0;
  transform: translateY(8px);
  animation: rise 300ms var(--ease-out) forwards;
}
.row:nth-child(2) { animation-delay: 50ms; }
.row:nth-child(3) { animation-delay: 100ms; }
.row:nth-child(4) { animation-delay: 150ms; }

@keyframes rise {
  to { opacity: 1; transform: translateY(0); }
}
```

30–80ms between items; never block interaction.

### Hold to confirm

```css
.fill-mask {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms var(--ease-out);
}
.destructive:active .fill-mask {
  clip-path: inset(0 0 0 0);
  transition: clip-path 2s linear;
}
.destructive:active {
  transform: scale(0.97);
}
```

### Tab color via clip

Duplicate tab row; clip active copy; animate `clip-path` not per-tab color tweens.

```css
.tabs-active-layer {
  clip-path: inset(0 60% 0 20%);
  transition: clip-path 250ms var(--ease-in-out);
}
```

### Scroll reveal (marketing only)

```css
.hero-block {
  clip-path: inset(0 0 100% 0);
  transition: clip-path 600ms var(--ease-in-out);
}
.hero-block[data-in-view] {
  clip-path: inset(0 0 0 0);
}
```

Once per element (`IntersectionObserver` or Motion `useInView` `{ once: true, margin: "-100px" }`).

### Drag dismiss

```js
const elapsed = Date.now() - pointerDownAt;
const speed = Math.abs(deltaY) / elapsed;
if (Math.abs(deltaY) >= DISMISS_PX || speed > 0.11) close();
```

```js
node.style.transform = `translateY(${deltaY}px)`;
```

Pointer capture; ignore second touch while dragging; rubber-band past edges; spring settle `{ type: "spring", duration: 0.5, bounce: 0.2 }`.

### Crossfade seam blur

```css
.inner {
  transition: filter 200ms ease, opacity 200ms ease;
}
.inner.is-swapping {
  filter: blur(2px);
  opacity: 0.7;
}
```

Keep blur &lt; 20px.

### WAAPI clip reveal

```js
node.animate(
  [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }],
  {
    duration: 1000,
    fill: 'forwards',
    easing: 'cubic-bezier(0.77, 0, 0.175, 1)',
  }
);
```

## Output

Deliver code; then briefly: gate + purpose, tool/properties/curve/duration, what to feel-check (2–5× slow, DevTools frames, device for gestures).
