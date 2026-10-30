# Android platform

Targets: Jetpack Compose, Android Views, React Native, Expo, Flutter on Android devices.

Visitor mode limits expression overrides. Material 3 owns structure, navigation, and interaction; brand applies through theme roles (color, type, shape, motion). Cross-platform apps that also ship on iPhone must still meet iOS guarantees on Apple hardware (safe areas, Reduce Motion, system back).


```android-body
## Native trust bar

If components feel foreign to daily Android users, realign. Common miss: iPhone idioms with Material skin—unchanged phone bottom bar on tablets, back chevrons that ignore system Back, Cupertino switches or dialogs. Material 3 components are the baseline; theme the brand through official roles.

## Layout and structure

- **Navigation by width:** bottom bar (3–5 destinations) on compact; rail or drawer when expanded—never scale a phone bar to tablet unchanged.
- **System Back** must work—honor predictive Back and the button; never trap users or steal the gesture.
- **Edge-to-edge** layouts with window insets for status bar, nav bar, cutout, and IME—content stays visible.
- **Top app bar** for screen context; add a FAB when one primary action dominates.

## Touch

**48×48 dp** minimum targets; **≥8 dp** between interactive neighbors.

## Typography

- **Material type scale** (Display, Headline, Title, Body, Label at L/M/S)—map UI text to roles; avoid one-off sizes.
- **Roboto** as the system workhorse; brand faces ride the scale while keeping body and labels legible.
- Use **sp**, not px, so text respects the user font-size setting.

## Color and theming

- **Material color roles** (primary, on-primary, surface, surface-variant, secondary-container, outline, error) resolve light/dark/contrast—avoid raw hex in components.
- **Dynamic Color (Material You)** when appropriate—wallpaper-derived schemes on Android 12+ with a static fallback.
- Treat **dark theme** as first-class—not a quick invert.
- **Tonal elevation** via surface steps (plus shadow when needed)—skip arbitrary drop shadows.

## Components and motion

- Material buttons (filled, tonal, outlined, text), FAB, switches, chips, snackbars, bottom sheets, dialogs, navigation bar/rail/drawer—no iOS control ports.
- **One FAB, one primary action** per screen context.
- **Snackbars** for transient feedback (actionable when useful); reserve dialogs for must-interrupt decisions.
- Material motion (container transform, shared-axis, fade-through) with standard easing; honor **Remove animations** with crossfade or instant cut.

## Build verification

- Capture from **emulator or device**, not a browser: `adb exec-out screencap -p > <path>` (use `adb -s <serial>` with multiple devices). Cover shipped classes—at least one phone; tablet when in scope—and place files where review expects them.
- Test **dark theme** and **font scale**: `adb shell cmd uimode night yes`; `adb shell settings put system font_scale 1.3` (restore `1.0` after); reuse `-s <serial>` on multi-device setups.
- Emulators help coverage; gestures, refresh behavior, and performance need hardware—record which source you used.

```
