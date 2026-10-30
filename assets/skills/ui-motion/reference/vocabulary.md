# Motion vocabulary (reverse lookup)

Maps vague descriptions to precise terms so prompts and specs use shared language. Naming only — not build (`reference/web.md`) or audit (`reference/review.md`).

## How to answer

User describes what they see or feel. Return:

```
**Term** — One-line definition.
```

Best match first; 1–2 alternates if close. Disambiguate (e.g. crossfade vs shared-element vs morph). If no exact match, say so and compose from glossary terms. Keep answers short.

## Glossary

### Entrances & exits
- **Fade in / Fade out** — Opacity to visible or hidden.
- **Slide in** — Enters from off-screen edge.
- **Scale in** — Grows from smaller size, often with fade.
- **Pop in** — Slight overshoot on arrival.
- **Reveal** — Gradual uncover via clip or mask.
- **Enter / Exit** — Motion when node mounts or unmounts.

### Sequencing & timing
- **Keyframes** — Defined waypoints the engine interpolates between.
- **Interpolation / Tween** — In-between frames between start and end values.
- **Stagger** — Sequential starts with small offsets — cascade.
- **Orchestration** — Multiple motions timed as one beat.
- **Delay** — Wait before start.
- **Duration** — Length of motion.
- **Fill mode** — Styles held before/after (e.g. forwards).
- **Stepped animation** — Discrete steps, not smooth blend.

### Movement & transforms
- **Translate** — Shift along X or Y.
- **Scale** — Resize uniformly.
- **Rotate** — Spin around a point.
- **Skew** — Shear from rectangular shape.
- **3D tilt / Flip** — rotateX/Y depth.
- **Perspective** — Viewer distance for 3D exaggeration.
- **Transform origin** — Anchor for scale/rotate.
- **Origin-aware animation** — Grows from trigger, not box center.

### State transitions
- **Crossfade** — Overlap fade between two states same place.
- **Continuity transition** — Same object reads across states (resize, reposition).
- **Morph** — One shape becomes another.
- **Shared element transition** — Element travels between layouts.
- **Layout animation** — Size/position animates to new layout.
- **Accordion / Collapse** — Height opens/closes for content.
- **Direction-aware transition** — Forward/back slide opposes by nav direction.

### Scroll & navigation
- **Scroll reveal** — Enters when entering viewport.
- **Scroll-driven animation** — Progress tied to scroll offset.
- **Parallax** — Layers move at different rates.
- **Page transition** — Motion between routes.
- **View transition** — Browser morph between document states.

### Feedback & interaction
- **Hover effect** — Pointer-over change (web).
- **Press / Tap feedback** — Brief scale on press.
- **Hold to confirm** — Fill while held for destructive confirm.
- **Drag** — Direct manipulation with optional momentum.
- **Drag to reorder** — List reorder with shifting neighbors.
- **Swipe to dismiss** — Off-screen drag to close.
- **Rubber-banding** — Resistance and snap at overscroll edge.
- **Shake / Wiggle** — Error/reject jitter.
- **Ripple** — Expanding circle from tap point.

### Easing
- **Easing** — Speed curve over time.
- **Ease-out** — Fast start, slow end — default for UI response.
- **Ease-in** — Slow start — usually avoid on UI.
- **Ease-in-out** — Slow-fast-slow for on-screen travel.
- **Linear** — Constant speed — spinners, progress.
- **Cubic-bezier** — Custom curve control points.
- **Asymmetric easing** — Different accel/decel — livelier than symmetric.

### Springs
- **Spring** — Physics-driven settle vs fixed duration.
- **Stiffness / Tension** — Pull toward target — higher = snappier.
- **Damping** — Oscillation decay — lower = more bounce.
- **Mass** — Heaviness of moving object.
- **Bounce** — Overshoot then settle.
- **Perceptual duration** — When motion *feels* done.
- **Momentum** — Velocity continues after release.
- **Velocity** — Speed/direction; springs preserve on interrupt.
- **Interruptible animation** — Retarget mid-flight smoothly.

### Looping & ambient
- **Marquee** — Continuous horizontal scroll loop.
- **Loop** — Repeating cycle.
- **Alternate (yoyo)** — Forward then reverse each cycle.
- **Orbit** — Path around anchor.
- **Pulse** — Rhythmic scale/opacity attention.
- **Float** — Gentle vertical drift idle motion.
- **Idle animation** — Subtle motion while waiting.

### Polish & effects
- **Blur** — Soften or hide transition seams.
- **Clip-path** — Hard-edge reveal/mask shapes.
- **Mask** — Soft-edge hide/reveal vs clip-path.
- **Before / after slider** — Draggable compare wipe.
- **Line drawing** — SVG stroke draw-on.
- **Text morph** — Character-wise text change.
- **Skeleton / Shimmer** — Loading placeholder sheen.
- **Number ticker** — Rolling digit counter.
- **Tabular numbers** — Fixed-width digits — stable counters.
- **Typewriter** — Sequential character reveal.

### Performance
- **Frame rate (FPS)** — 60 baseline; 120 on high-refresh displays.
- **Jank** — Visible stutter from missed frames.
- **Dropped frame** — Missed paint deadline hitch.
- **Compositing** — GPU layer move/fade without layout.
- **will-change** — Hint upcoming animation for promotion.
- **Layout thrashing** — Layout-forcing props animated each frame.

### Principles
- **Purposeful animation** — Motion serves orientation/feedback, not filler.
- **Anticipation** — Small wind-up before main move.
- **Follow-through** — Secondary motion after main stop.
- **Squash & stretch** — Deform conveys weight/speed.
- **Perceived performance** — Motion changes felt speed.
- **Frequency of use** — More exposure → shorter/subtler motion.
- **Spatial consistency** — Same identity/path across states.
- **Hardware acceleration** — transform/opacity on GPU.
- **Reduced motion** — Honor system preference — gentler, not always off.
