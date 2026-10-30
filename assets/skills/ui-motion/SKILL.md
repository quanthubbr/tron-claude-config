---
name: ui-motion
user-invocable: true
description: Use when adding, reviewing, or improving UI animation and interaction feel on web or Expo/React Native — motion vocabulary, toasts, choosing UI primitive libraries, and quick interactive prototypes.
---

# Motion & interaction craft

Interaction polish is trained judgment: small correct choices stack into software that feels inevitable. Users rarely notice individual transitions; they notice when nothing fights them.

## Core principles

### Why details matter

Invisible correctness compounds. When behavior matches expectation, people move on — that is success. Motion should earn its milliseconds: orient, confirm input, or bridge state — not decorate high-traffic paths.

### Before any animation

**Frequency gate**

| How often users see it | Decision |
| --- | --- |
| 100+ times/day (shortcuts, palette, tab churn) | **No animation** |
| Tens/day (hover, list hops) | Barely there or none |
| Occasional (modal, drawer, toast) | Standard motion |
| Rare (onboarding, success, celebration) | Delight budget |

Keyboard-driven flows never animate — repetition makes motion feel like lag.

**Purpose** — pick a single label: press confirmation, where-it-came-from continuity, readable state change, softening an abrupt swap, teaching a feature (marketing/onboarding only), or rare delight. Unlabeled → no code.

### Easing

| Situation | Curve |
| --- | --- |
| Enter / exit | ease-out |
| Move on screen | ease-in-out |
| Hover / color | ease |
| Constant motion | linear |
| Default | ease-out |

Never **ease-in** on UI — it delays the first pixel users watch for.

Built-in CSS easings are weak; prefer tokens:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Pick stronger curves from [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/) — do not hand-tweak beziers.

### Duration

| Element | ms |
| --- | --- |
| Press feedback | 100–160 |
| Tooltip / small popover | 125–200 |
| Dropdown / select | 150–250 |
| Modal / drawer | 200–500 |
| Marketing | longer OK |

**UI motion stays under 300ms** unless justified. Faster spinners and snappier selects change perceived speed without changing load time.

### When not to animate

High-frequency paths, keyboard actions, and data users must read should stay still. Decorative motion on dense functional UI hurts more than it helps.

### Reduced motion

`prefers-reduced-motion` means **fewer and gentler**, not off: keep opacity/color that explains state; drop translation, scale, parallax.

```css
@media (prefers-reduced-motion: reduce) {
  .surface { animation: fade 0.2s ease; }
}
```

### Performance

Animate **transform** and **opacity** (plus sanctioned **clip-path** where recipes allow). Avoid width/height/margin/padding/top/left — they trigger layout every frame.

- CSS transitions retarget mid-flight; keyframes restart — use transitions for rapid toggles (toasts, stacks).
- Springs carry velocity through interruption — good for drags.
- Motion library shorthand `x`/`y`/`scale` runs on the main thread; under load use `transform: "translateX(...)"` for GPU paths.
- Do not drive child transforms via a CSS variable on a parent — set `transform` on the element being moved.

### Physicality shortcuts

- Press: `scale(0.97)` on `:active`, ~160ms ease-out.
- Enter: never from `scale(0)` — use `scale(0.95)` + `opacity: 0`.
- Popovers/menus/tooltips: `transform-origin` at trigger (`var(--transform-origin)` with Base UI). Modals stay centered.

### Review output shape

When critiquing motion in code, use a **Before | After | Why** markdown table — not separate Before/After lists.

## Route to reference files

| Task | Read |
| --- | --- |
| Build web animation (sequence + recipes) | [reference/web.md](reference/web.md) |
| Build Expo / React Native motion | [reference/expo.md](reference/expo.md) |
| Name an effect ("what's it called when…") | [reference/vocabulary.md](reference/vocabulary.md) |
| Find where UI should motion (read-only) | [reference/opportunities.md](reference/opportunities.md) |
| Review a diff or audit / plan fixes | [reference/review.md](reference/review.md) |
| Sonner toasts — setup, API, fixes | [reference/toasts.md](reference/toasts.md) |
| Pick a library for a UI task | [reference/ui-libraries.md](reference/ui-libraries.md) |
| Multi-variant prototype + picker harness | [reference/prototype.md](reference/prototype.md) |

**Related skills:** `ui-design` (direction and engine workflow), `ui-patterns` (charts, forms, nav — after direction is set), `native-ui` (platform-native craft), agents `exo-designer`, `exo-frontend`, `exo-mobile`.
