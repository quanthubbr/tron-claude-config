> **Additional context needed**: performance constraints.

Motion should explain state, relationship, and hierarchy—or deliver one authored moment the surface earned. Purposeless motion is debt. For deeper motion craft, see `ui-motion`.

---

## Visitor mode


```animate-body
- **Persuade + Experience:** motion may carry voice. Prefer one rehearsed focal sequence over repeated section reveals.
- **Operate + Read:** feedback, state, continuity; routine transitions fast—no page-load choreography.
- **Native (`ios` / `android` / `adaptive`):** follow Motion in [ios.md](ios.md) or `android.md`, including Reduce Motion. Skip web tooling below.

## Find the job

Study existing motion language, states, devices, and budget. Animate only where motion would:

- acknowledge action;
- clarify state or spatial change;
- preserve continuity across navigation/layout;
- direct attention at a meaningful beat;
- express the selected visual world.

Ask only when a material constraint is unknowable. Do not animate static areas by default.

## Motion thesis (short plan)

- **Focal moment:** one authored sequence, if any.
- **Continuity:** what layout/nav changes need explanation.
- **Feedback:** controls/outcomes needing acknowledgment.
- **Budget:** expensive effects and frequency.

The focal moment must come from this product—not generic fade-rise, hover lift, parallax, or scroll reveal.

## Material by meaning

Transform and opacity are foundations, not the whole toolkit:

- **Continuity:** shared-element, FLIP, view transitions, deliberate spatial move.
- **Depth/focus:** bounded blur, filter, backdrop, light, shadow.
- **Reveal:** masks, clip-path, controlled occlusion.
- **Energy:** color/gradient/texture/shader when world + runtime support it.
- **Feedback:** smallest change that makes cause→effect clear.

One strong material idea beats stacked spectacle. List stagger: cap total delay; not every section is a staggered list.

## Timing and easing

| Duration | Use |
|---|---|
| 100–150 ms | immediate feedback |
| 150–300 ms | routine state change |
| 300–500 ms | layout, overlay, view transition |
| 500–800 ms | authored focal entrance |

Exits faster than entrances. Natural deceleration e.g. `cubic-bezier(0.16, 1, 0.3, 1)`; avoid bounce/elastic by reflex. Long feedback feels like lag.

## Runtime implementation

- CSS transitions/keyframes for declarative state.
- WAAPI or project motion library for interruption/sequencing.
- View Transitions / shared-element when continuity is the point.
- Scroll-driven only when scroll relationship matters—with fallback.
- No new dependency for what the stack already handles cleanly.

Default state keeps content visible if scripts fail. Avoid casual animation of layout drivers (`width`, `height`, `top`, `left`, margins)—use FLIP/transforms/grid. Isolate expensive blur/filter/shadow/canvas/shader. `will-change` only during known animation. Measure on target hardware.

## Accessibility

Respect autoplay/sound prefs; stop nonessential loops offscreen.

Web: `prefers-reduced-motion` path—reduce spatial move; keep meaningful opacity/color/state. Reduced motion ≠ zero motion; action feedback stays legible.

## Verify

- Focal motion matches world and surface.
- Supporting motion explains feedback/state/relationship.
- Interruption and repeat use behave.
- Desktop, mobile, keyboard usable.
- Reduced-motion path preserves meaningful feedback.
- Expensive effects smooth on target device.
- Removing motion would lose meaning—not just decoration.

Then `/ui-design polish`.

```
