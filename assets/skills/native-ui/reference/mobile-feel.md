# Mobile web: feel installed, not embedded

Remove the browser tells one layer at a time — viewport, touch, scroll, safe areas, chrome color. This is **not** motion design (**ui-motion**) or RN animation (**ui-motion** Expo references). The phone is the source of truth; desktop device mode lies about most items below.

## Posture

Senior design engineer mindset: drawers and sheets shipped to real devices. Two anti-patterns:

1. **Fixing only what desktop shows** — sticky hover, tap highlight, URL bar height, input zoom, and overscroll rarely reproduce in emulation.
2. **JavaScript where CSS/meta suffices** — e.g. `useIsTouchDevice()` instead of `(hover: hover)`.

## Hard rules

1. **Every fix includes a why** — scope to controls vs content (`user-select: none` on buttons, never on body copy).
2. **Capability queries, not UA sniffing** — `(hover: hover)`, `(pointer: fine/coarse)`, `env()`, `dvh`.
3. **Touch and pointer coexist** — iPad trackpad, touch laptops; gate by capability.
4. **Never disable zoom** — use **16px minimum** on focused inputs instead of `maximum-scale=1`.
5. **Confirm on hardware** before calling done — USB debug, LAN IP to dev server, Safari Develop menu or `chrome://inspect`.

## Symptom → fix

| Symptom | Fix |
| --- | --- |
| Hover stuck after tap | Gate `:hover` behind `(hover: hover) and (pointer: fine)` |
| Gray/blue tap flash | `-webkit-tap-highlight-color: transparent` on `html` |
| Wrong full-height layout | `100dvh` shell; `100svh` hero |
| Focus zooms page | `font-size: 16px` on inputs |
| Sluggish tap | `:active` / `pointerdown` + `touch-action: manipulation` |
| Pull-to-refresh steals scroll | `overscroll-behavior: none` on root; `contain` on inner scrollers |
| Notch/home indicator clip | `viewport-fit=cover` + `env(safe-area-inset-*)` |
| Long-press selects control label | `user-select: none` + `-webkit-touch-callout: none` on controls |
| Carousel fights vertical scroll | `touch-action: pan-y` (horizontal track) or `none` on custom drag surfaces |
| Status bar mismatch | `theme-color` per color scheme |
| “Fine in Chrome devtools” | Test on device |

## Fixes in detail

### Sticky hover

Browsers synthesize `:hover` after tap until the next tap elsewhere. Wrap hover styles:

```css
@media (hover: hover) and (pointer: fine) {
  .chip:hover { transform: scale(1.02); }
}
```

Tailwind v4 `hover:` already wraps; v3 enable `future.hoverOnlyWhenSupported`. Touch users get `:active` instead.

### Tap highlight

```css
html { -webkit-tap-highlight-color: transparent; }
```

Replace with deliberate `:active` on tappables.

### Viewport height

`100vh` equals **largest** viewport — URL bar visible on load causes overflow and hidden bottom bars.

```css
.shell { height: 100dvh; }
.landing { min-height: 100svh; }
```

`dvh` tracks chrome show/hide (good for apps); `svh` stable minimum (good for heroes). Avoid `lvh` except legacy fallback.

### Input zoom (iOS)

Under-16px focused fields zoom and may not restore layout.

```css
input, textarea, select { font-size: 16px; }
```

Desktop smaller type:

```css
@media (pointer: coarse) {
  input, textarea, select { font-size: 16px; }
}
```

Also set `inputmode`, proper `type`, `autocapitalize`, `autocorrect`, and `enterkeyhint` for the field job.

### Tap latency

```css
.tappable {
  touch-action: manipulation;
}
```

Style **`:active`** (or `pointerdown`) — waiting for `click` feels late even at 0ms.

```css
.btn {
  transition: transform 120ms ease-out, background 120ms ease-out;
}
.btn:active {
  transform: scale(0.97);
}
```

Align durations with **ui-motion** tokens when the project has them.

### Overscroll

```css
html, body { overscroll-behavior: none; }

.scroll-pane {
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

Do not block scroll with non-passive `touchmove` preventDefault.

### Safe areas

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

```css
.header { padding-top: env(safe-area-inset-top, 0px); }
.footer {
  padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}
```

Without `viewport-fit=cover`, `env()` insets are zero.

### Control text selection

```css
button, [role="button"], .tab, .chip {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
```

### Carousel axis ownership

```css
.horizontal-track { touch-action: pan-y; }
.drag-surface { touch-action: none; }
.vertical-sheet { touch-action: pan-x; }
```

Values describe what the **browser** may still pan. Native `scroll-snap` horizontal tracks often need no JS gesture layer.

### Theme color

```html
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
<meta name="color-scheme" content="light dark" />
```

Match the **top pixel** of the page (header background). PWAs: align manifest `theme_color` / `background_color` and Apple status bar meta when standalone.

### Hardware verification

- Serve dev on `0.0.0.0`, open via LAN IP.
- Older phone, keyboard open, landscape once, installed PWA if in scope.
- Simulator better than pure emulation; still not a substitute for touch.

## Baseline bundle

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff" />
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0a0a" />
```

```css
html {
  -webkit-tap-highlight-color: transparent;
  -webkit-text-size-adjust: 100%;
  overscroll-behavior: none;
}

input, textarea, select { font-size: 16px; }

button, a, [role="button"] {
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}

@media (hover: hover) and (pointer: fine) {
  /* hover-only rules */
}
```

Drop root `overscroll-behavior: none` on document sites where pull-to-refresh is desired.

## Never ship

| Avoid | Prefer |
| --- | --- |
| `user-scalable=no`, `maximum-scale=1` | 16px inputs |
| Ungated `:hover` | Capability media query |
| `100vh` app shell | `100dvh` |
| `100dvh` marketing hero | `100svh` |
| Feedback only on `click` | `:active` / `pointerdown` |
| JS to block overscroll | `overscroll-behavior` |
| `user-select: none` on `body` | Controls only |
| `touch-action: none` on scroll-through UI | `pan-x` / `pan-y` |
| `env(safe-area-*)` without cover viewport | Add meta |
| One `theme-color` | Per scheme |
| UA sniffing | `(hover)` / `(pointer)` |
| “Fixed” from emulation only | Device check |

## Tone

State the one-line fix and reason. If verification needs hardware, say so plainly.
