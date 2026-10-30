---
name: native-ui
user-invocable: true
description: Use when designing or building native-feeling mobile or desktop UI — Apple platform design quality, making React Native/Expo or web-on-mobile feel installed, or writing idiomatic Swift and SwiftUI.
---

# Native platform craft

Native quality is not a skin: it is latency, touch truth, spatial logic, and platform APIs used the way the runtime expects. This skill covers three lanes — platform design discipline, web/PWA/mobile-web platform fixes, and Swift/SwiftUI implementation — without duplicating full motion recipes (see **ui-motion**) or general design workflow (see **ui-design**).

## Core principles

### Directness first

Perceived quality drops the moment input lags. Highlight on **press**, not release; keep drags **1:1** with the pointer; never block input mid-transition. Every animation must be **interruptible** from the current on-screen value, not a preset endpoint.

### Physical continuity

Springs beat fixed timelines for anything the user touches: they retarget, inherit velocity, and tolerate reversal. Hand off **release velocity** into the follow-through animation; **project momentum** to pick snap targets after flicks. Separate X and Y when velocities differ.

### Spatial honesty

Enter and exit on the **same axis**; anchor sheets and menus to their **trigger**; mirror easing on reversible paths. Typography, materials, and hierarchy should read as one system — size-specific tracking, translucent chrome with legible vibrancy, reduced-motion equivalents that still communicate state.

### Platform layer vs motion layer

Most “janky on my phone” reports are **viewport, touch, scroll, safe-area, and browser chrome** — not easing curves. Fix capability queries, `dvh`, `overscroll-behavior`, and 16px inputs before tuning springs. For RN/Expo gesture feel, pair **ui-motion** with native navigation and haptics expectations from **reference/mobile-feel.md**.

### Swift: simplest static thing that works

Prefer **structs/enums**, **`let`**, **main-actor-by-default** UI, and **`some` protocols** until profiling or type erasure forces a step down. **`async` does not offload** in Swift 6.2+ — use **`@concurrent`** for CPU work after Instruments proves a hang. Fix data races by **stopping sharing**, not silencing Sendable.

### Agents and related skills

| Role | Skill / agent |
| --- | --- |
| UI spec, native design review | **exo-designer** |
| Web implementation | **exo-frontend** |
| RN / SwiftUI implementation | **exo-mobile** |
| Charts, forms, nav patterns, stack how-tos | **ui-patterns** (after direction is set) |
| Animation vocabulary, Expo motion, toasts | **ui-motion** |
| Full design engine (PRODUCT.md, DESIGN.md, live review) | **ui-design** — `<skill-dir>/scripts/ui-design <verb>`, `/ui-design <command> [target]` |

## Routing table

| You need… | Read |
| --- | --- |
| Fluid gestures, materials, type, HIG-level foundations on web or cross-platform UI | [reference/apple.md](reference/apple.md) |
| Web/PWA that feels installed: hover stuck, tap flash, vh, notch, pull-to-refresh, carousels | [reference/mobile-feel.md](reference/mobile-feel.md) |
| Swift 6 concurrency, Sendable, SwiftUI isolation, API shape, performance, tests | [reference/swift.md](reference/swift.md) |
| Spring defaults, duration tables, reduced-motion for transitions | **ui-motion** |
| Visual direction, audit, polish workflow | **ui-design** |

## Working posture

1. **Match symptom to lane** — platform CSS/meta (mobile-feel), interaction physics (apple + ui-motion), or language/runtime (swift).
2. **Ship the reason with each fix** — apply rules where the failure mode exists, not globally by habit.
3. **Hardware for mobile-web** — emulation misses sticky hover, tap delay, rubber-band, keyboard viewport, and safe-area truth; say what code proves vs what needs a device.
4. **Cross-check accessibility** — `prefers-reduced-motion`, reduced transparency, contrast; native controls stay usable without vestibular overload.

## Output (mobile-feel fixes)

When applying platform-layer patches, keep the summary short:

- **Symptom** — table row matched + one-line cause.
- **Change** — file and declaration.
- **Verify on device** — what code review covers vs what the user must confirm on hardware.
