# Utilitarian minimal UI

Use when the product should read like a calm document workspace: warm monochrome, typographic hierarchy, flat bento, muted pastels—no spectacle gradients or heavy elevation.

## Banned defaults

- Inter, Roboto, Open Sans as primary voice
- Default Lucide/Feather/Heroicons as the only icon language
- Tailwind `shadow-md` / `shadow-lg` without extreme diffusion (<0.05 opacity)
- Large saturated hero backgrounds (bright blue/green/red fields)
- Gradients, neon, heavy glass (except subtle nav blur)
- `rounded-full` on large cards or primary buttons
- Emojis in UI copy or markup
- Placeholder names (John Doe, Acme) and hype verbs (“elevate”, “seamless”, “delve”)

## Typography

Contrast drives the UI:

- **UI sans:** SF Pro Display, Geist Sans, Helvetica Neue, Switzer—geometric, calm
- **Editorial serif:** Lyon Text, Newsreader, Playfair, Instrument Serif—for hero/quotes only; tight tracking (`-0.02em` to `-0.04em`), line-height ~1.1
- **Mono:** Geist Mono, SF Mono, JetBrains—for code and meta
- Body never pure black; use `#111` / `#2F3437`, leading ~1.6; secondary `#787774`

## Palette

Scarce color; semantic pastels only:

| Role | Values |
|------|--------|
| Canvas | `#FFFFFF`, `#F7F6F3`, `#FBFBFA` |
| Surface | `#FFFFFF`, `#F9F9F8` |
| Border | `#EAEAEA`, `rgba(0,0,0,0.06)` |
| Pastel tags | Red `#FDEBEC` / `#9F2F2D`; Blue `#E1F3FE` / `#1F6C9F`; Green `#EDF3EC` / `#346538`; Yellow `#FBF3DB` / `#956400` |

## Components

- **Bento:** Asymmetric grid; cards `1px solid #EAEAEA`; radius 8–12px; padding 24–40px
- **Primary button:** `#111` fill, white text, radius 4–6px, no shadow; hover `#333` or `scale(0.98)`
- **Tags:** Small uppercase pills with pastel fills
- **FAQ:** No boxes—`border-bottom` separators; `+` / `−` toggles
- **Shortcuts:** `<kbd>` with 1px border, `#F7F6F3` fill, mono
- **App chrome mock:** White title bar with three light gray window dots

## Imagery

Phosphor Bold/Fill or Radix icons—consistent stroke. Illustrations: monochrome line art + one pastel geometric accent. Photos desaturated, warm; subtle grain overlay (~4%). Placeholders: `picsum.photos/seed/{context}/1200/800`. Section backgrounds: ultra-low opacity imagery, warm radial spots (~3%), or faint line patterns—never empty flat voids.

## Motion (quiet)

- Enter: `translateY(12px)` + opacity over 600ms, `cubic-bezier(0.16, 1, 0.3, 1)` via `IntersectionObserver`
- Card hover: shadow `0 2px 8px rgba(0,0,0,0.04)` over 200ms
- Lists: stagger `calc(var(--index) * 80ms)`
- Optional fixed-layer ambient gradient drift 20s+, opacity 0.02–0.04
- Transform/opacity only; sparing `will-change`

## Build order

1. Macro whitespace (`py-24`–`py-32`)
2. Content width `max-w-4xl`–`5xl`
3. Type + monochrome tokens
4. Uniform 1px borders
5. Scroll entry on major blocks
6. Depth via imagery/texture, not decoration noise
