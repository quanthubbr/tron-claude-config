> **Gather:** platforms, device classes, and usage contexts.

Port native UI (`ios` / `android` / `adaptive`) to another class, orientation, platform, or origin. Scaling pixels fails—rethink under platform guides (read the target platform reference before planning).

## Scope

1. **Source:** original target and assumptions (phone-only, portrait-only, one platform’s idioms, a website?).
2. **Target:** device class, orientation, platform, posture (one-handed vs two-handed).
3. **Breaks:** nav that does not fit; stretched layouts; missing gestures or controls.

## Strategies

### Phone → tablet

Restructure—do not stretch. Size classes / window size classes switch layout. Nav reshapes (tab bar → sidebar; bottom bar → rail/drawer). Use width: split view, grids, popovers. Multitasking can yield phone-width—size-class layouts cover it.

### Orientation and foldables

Landscape restructures; no clip/letterbox. Lock orientation only when the task demands. Foldables: posture/hinge via window size classes—test folded, unfolded, tabletop.

### Cross-platform

Translate idioms—never transplant controls. Rebuild nav and controls in target vocabulary; carry brand via theming (palette intent, type accent, motion).

### Web → native

Reconform: platform nav, platform controls, touch-first, Dynamic Type/sp. Full platform reference is the acceptance bar.

## Verify

Drive structure from size classes—never device-model checks. Safe areas/insets in every configuration. Simulators for breadth; hardware for posture, gestures, performance.

Then `/ui-design polish`.

**NEVER:** stretched phone on tablet; ported controls; hidden core functionality; orientation lock to hide bugs; simulators-only for gesture/perf truth.
