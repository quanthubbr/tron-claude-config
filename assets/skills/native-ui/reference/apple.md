# Platform design discipline (fluid UI)

Interfaces feel native when motion starts from **where pixels are now**, carries **user velocity**, can be **grabbed mid-flight**, and respects **boundaries** like physical objects. Springs are the default tool for touch-driven UI because they retarget without a fixed duration.

Design serves predictability, comprehension, accomplishment, and delight — not spectacle on every tap.

## Response and manipulation

- **Zero perceived lag** on the input path: audit debounces, artificial waits, and legacy tap delay.
- **Continuous feedback during** drags/sliders — not only on gesture end.
- **Pointer capture** so tracking survives leaving the hit target; record **grab offset** and a short **velocity history** for release.

```css
.control:active {
  transform: scale(0.97);
  transition: transform 100ms ease-out;
}
```

```js
node.addEventListener('pointerdown', (evt) => {
  node.setPointerCapture(evt.pointerId);
  const grabY = evt.clientY - node.getBoundingClientRect().top;
  // append { y, t } samples for velocity at pointerup
});
```

## Interruptibility

- Never freeze input during a transition.
- **Read live transform** when retargeting; never restart from the logical target.
- Avoid `@keyframes` and non-retargetable CSS transitions on gesture-driven surfaces; prefer spring libraries that accept velocity on interrupt.
- On direction reversal, **blend velocity** — hard swaps feel like hitting a wall.
- Use **independent springs** on X and Y when axes decouple.

## Springs (designer parameters)

Think **damping ratio** (overshoot) and **response** (snappiness in seconds — not a fixed duration):

| Use | Damping | Response |
| --- | --- | --- |
| Reposition / move | 1.0 | ~0.4 |
| Rotation | ~0.8 | ~0.4 |
| Sheet / drawer | ~0.8 | ~0.3 |

Default UI: **critical damping (1.0)**. Add bounce (~0.8) only when the gesture had **momentum** (flick, throw).

```js
import { animate } from 'motion';

animate(panel, { y: 0 }, { type: 'spring', bounce: 0, duration: 0.4 });
animate(card, { y: landingY }, { type: 'spring', bounce: 0.2, duration: 0.4 });
```

## Velocity and projection

At release, seed the spring with **pointer velocity** (APIs may want absolute px/s or normalized `(target − current)`).

Project resting point with exponential decay (not textbook `v²/2a`):

```js
function projectedOffset(velocityPxPerSec, decay = 0.998) {
  const v = velocityPxPerSec / 1000;
  return (v * decay) / (1 - decay);
}

const rest = current + projectedOffset(releaseVelocity);
const snap = nearestSnap(rest);
```

## Spatial consistency and hints

- Dismiss along the **same vector** as presentation.
- Set **transform-origin** at the trigger for menus, popovers, sheets.
- **Mirror easing** on paired enter/exit (inverse cubic-bezier control points).
- Mid-gesture frames should **telegraph outcome** — motion points where the gesture is heading.

## Rubber-band edges

Resist progressively past limits instead of hard stops:

```js
function softClamp(overshoot, extent, stiffness = 0.55) {
  const a = Math.abs(overshoot);
  return (overshoot * extent * stiffness) / (extent + stiffness * a);
}
```

## Gesture checklist

| Gesture | Rule |
| --- | --- |
| Tap | Down-state immediately; commit on up; ~10px slop; cancel by dragging away |
| Drag | Small threshold before axis lock; then 1:1 tracking |
| Recognition | Parallel candidates early; cancel losers when intent is clear |
| Double-tap tax | Only where double-tap is real — it delays single taps |

## Frame quality

- Prefer **transform** and **opacity**; sync to display via `requestAnimationFrame`.
- Limit per-frame positional jumps; optional subtle stretch/blur on very fast moves.

## Materials and depth

- Floating chrome: semi-transparent fill + **backdrop-filter**; content scrolls beneath.
- Heavier blur/shadow on large surfaces; **do not stack light glass on light glass**.
- Modals: dim + push back; parallel panels: translucency without full scrim.
- **Vibrancy**: higher contrast type on blur; color on opaque layers.
- Prefer **scroll edge fade** over hard 1px dividers under floating bars.
- Enter/exit materials by animating **blur + scale**, not opacity alone.

```css
.bar {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(20px) saturate(180%);
}
```

## Multimodal feedback

1. **Cause** — feedback on the event that earned it.
2. **Sync** — visual, haptic, and audio on the **same frame**.
3. **Restraint** — haptics/sound for meaningful commits, not every hover.

## Accessibility preferences

| Signal | Adaptation |
| --- | --- |
| `prefers-reduced-motion` | Short opacity cross-fades; no elastic travel |
| `prefers-reduced-transparency` | Solid fills; drop heavy blur |
| `prefers-contrast: more` | Solid backgrounds + clear borders |

Avoid full-viewport drift, ~0.2 Hz loops, and abrupt theme brightness jumps.

## Typography

- **Tracking scales with size** — tighten display, neutral body, slight positive on tiny UI type.
- **Leading inverse to size** — tight headlines, airy body.
- Hierarchy via **weight + size + leading**, not size alone.
- Respect **Dynamic Type** — spacing in `rem`/`em`.
- **System UI font** first unless brand requires otherwise.

```css
.hero-title {
  line-height: 1.05;
  letter-spacing: -0.02em;
  font-optical-sizing: auto;
}
```

## Design foundations (decision names)

1. **Purpose** — spend attention only where it pays.
2. **Agency** — choices, undo, confirm only irreversible harm.
3. **Responsibility** — privacy timing, safety previews, cut risky features.
4. **Familiarity** — consistent placement and metaphor; break patterns only with evidence.
5. **Flexibility** — context, device, ability; personalization when one layout fails all.
6. **Simplicity** — remove noise, not bury tools; common path first.
7. **Craft** — deliberate spacing, type, motion; rotation and alignment bugs erode trust.
8. **Delight** — emergent from the seven, not sticker confetti.

Tactics: four feedback kinds (status, completion, warning, error); wayfinding on every screen; proximity mapping; **specific nav labels** over generic “Home”.

## Process

Prototype interactively; design motion and visuals together; test in context; review motion frame-by-frame occasionally.

## Quick lookup

| Need | Approach |
| --- | --- |
| Default spring | Damping 1.0, response 0.3–0.4 |
| Flick spring | Damping ~0.8 + velocity handoff |
| Interrupt | Animate from presentation value |
| Flick target | Exponential projection + nearest snap |
| Edge | Rubber-band, not clamp |
| Chrome | Translucent layer, content under |
| Reduced motion | Fade/state color, not slide |

For web motion tokens and review format, use **ui-motion**.
