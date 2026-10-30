# iOS platform

Targets: SwiftUI, UIKit, React Native, Expo, Flutter shipping on iPhone and iPad.

Visitor mode caps how far expression may override platform rules. Human Interface Guidelines own structure, navigation, and interaction; brand shows through tint, typography, motion, and content.


```ios-body
## Native trust bar

If controls feel unfamiliar to daily iPhone users, stop and realign. Red flags: bespoke global nav, broken edge-back, web-shaped buttons, hover-only cues. Prefer system components; custom controls only when users clearly benefit.

## Layout and structure

- Respect safe-area insets—keep controls out of notch, Dynamic Island, home indicator, and corner radii.
- Navigation: tab bar for 2–5 top-level sections (never primary actions), stack for depth, sheet for focused tasks—no mixed global nav metaphors.
- Preserve edge-swipe back; do not overlay or disable it.
- Large titles on root screens; collapse to inline on scroll; detail screens stay inline.

## Touch

Minimum **44×44 pt** hit targets with spacing between neighbors.

## Typography

- **Dynamic Type** via system text styles (Large Title through Caption)—avoid hard-coded point sizes for UI text.
- **San Francisco** for body, labels, and controls; brand faces only in display moments.
- Floor **11 pt**; body typically **17 pt**.

## Color and materials

- **Semantic system colors** (label, secondaryLabel, systemBackground, separator, tint) for Dark Mode and increased contrast—raw hex fights the system.
- Ship and test **Dark Mode** as a peer appearance.
- Single **tint** drives interactivity—not decoration.
- Use **system materials** for bar and sheet blur—skip handmade glass effects.

## Components

- Platform controls: switch, segmented control, stepper, system pickers, action sheets, alerts, context menus, swipe actions.
- **SF Symbols** with baseline alignment and Dynamic Type scaling—do not mix arbitrary web icon sets.
- Sheets for dismissible subtasks; full-screen cover for immersion; clear Cancel/Done; allow swipe-dismiss unless data would be lost.
- Grouped or inset lists for settings patterns—not ad-hoc card stacks.

## Motion

- Prefer system transitions (push, sheet rise, dismiss reverses entrance).
- **Reduce Motion:** favor crossfades over large parallax or travel.

## Build verification

- Capture from **Simulator**, not a browser: `xcrun simctl io booted screenshot <path>` (use device UDID from `xcrun simctl list devices booted` when several are booted). Cover every shipped device class—at least one phone; add iPad when tablet is in scope—and store files where review expects them.
- Include **Dark Mode** and a **large Dynamic Type** setting: `xcrun simctl ui booted appearance dark` (reuse the capture UDID); large content size exposes truncation fixed layouts hide.
- Simulators cover breadth; gestures, posture, and performance need hardware—state which source produced the evidence.

```
