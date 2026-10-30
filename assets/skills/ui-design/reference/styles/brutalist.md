# Industrial brutalist UI

Use when the interface should feel like Swiss print manuals or tactical telemetry: rigid grids, extreme type scale, utilitarian color, simulated analog degradation.

## Choose one archetype (do not mix)

### Swiss industrial print (light)

Newsprint substrates (`#F4F4F0`, `#EAE8E3`), carbon ink text (`#050505`–`#111`), aviation red accent (`#E61919` / `#FF2A2A`) only. Visible grid lines, oversized numerals bleeding viewport edges, heavy neo-grotesk in uppercase blocks.

### Tactical telemetry (dark)

CRT black (`#0A0A0A`, `#121212`), phosphor white text (`#EAEAEA`), same red accent. Optional terminal green (`#4AF626`) on **one** semantic element—not general body copy. Monospace dominance, ASCII framing, scanline/grain effects.

## Typography

**Macro (structure):** Black/heavy sans at fluid scale `clamp(4rem, 10vw, 15rem)`; tracking −0.03em to −0.06em; line-height 0.85–0.95; uppercase. Candidates: Neue Haas Grotesk Black, Archivo Black, Monument Extended, heavy grotesk flex variants.

**Micro (data):** Mono 10–14px; tracking +0.05em to +0.1em; uppercase metadata, nav, coordinates. JetBrains Mono, IBM Plex Mono, Space Mono, VT323.

**Contrast serif (rare):** High-contrast serif splashes only with halftone/dither treatment—never clean vector luxury pairing by default.

## Color discipline

No gradients, soft drops, or modern glass. One substrate mode per project—never light and dark sections alternating casually.

## Layout

Blueprint grid: elements anchor to tracks, not float. Compartmentalize with 1–2px solid rules; full-width `<hr>` between operational blocks. Bimodal density: tight metadata clusters vs vast negative space around macro type. **Border-radius: 0** everywhere.

## Symbology & components

Frame labels with ASCII brackets: `[ SYSTEM ]`, `< UNIT >`. Directional markers `>>>`, `///`. Registration/copyright glyphs as geometry. Crosshairs at intersections, barcode stripes, revision strings (`REV 2.6`, `UNIT / D-01`).

## Texture (CSS/SVG)

- Halftone / 1-bit dither on imagery or serif blocks (`mix-blend-mode: multiply` + dot SVG)
- CRT scanlines: repeating horizontal gradient lines on dark mode
- Global low-opacity noise filter on root for unified grain

## Engineering

- `display: grid; gap: 1px` with contrasting parent/child backgrounds for hairline dividers
- Semantic tags: `<data>`, `<samp>`, `<kbd>`, `<output>`, `<dl>`
- Macro sizes via `clamp()` only
