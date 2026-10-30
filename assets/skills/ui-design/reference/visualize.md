# Visualize — comps & raster provenance

Open from the parent **new-work** playbook on **comp-led** builds when image generation exists (harness tool or API fallback from `ui-design context`). **Code-led** skips this file by design. Preconditions: `PRODUCT.md`, settled world—do not reopen identity. A prior surface round with three decision cards may already supply an approved comp—record approval and jump to [After approval](#after-approval).

Probe **composition** (hierarchy, density, focal moment, image needs)—not a second identity workshop. Keep palette, type, materials, component character, imagery stance, and motion grammar from `DESIGN.md` fixed.

## Three compositional comps

Runs inside open `build-phase` **comps** gate:

```bash
<skill-dir>/scripts/ui-design build-phase start --direction <seed-key> --kind <assigned|pick|challenger|canon>
# or: build-phase start --comp <approved-comp>
```

`<skill-dir>/scripts/ui-design generate-image` refuses writes under `.impeccable/mocks/` until `start` ran; native image tools follow the same order.

Save three high-fidelity north-star comps under `.impeccable/mocks/` with prompt sidecars. Frame: portrait device size for native/mobile-first; landscape for desktop web.

Build thread owns prompts (full direction context). Established worlds: reference screenshot via harness input or:

```bash
<skill-dir>/scripts/ui-design generate-image --ref <screenshot> --prompt-file <file> --out <path> --size <WxH> --quality high
```

Reference carries chrome/palette/type—not copied page content. Trio = decision comp plus **two variations** on what the first held fixed.

Quality gates (regenerate when failed):

- Must read as **UI**, not poster/photo
- Subject content present in regions
- Visitor mode obvious without caption
- One dominant move; quiet supporting regions

## Approval

Show three via decision page (`<skill-dir>/scripts/ui-design serve-question`, one option per comp) or inline image UI. Wait for approve/combine/revise/reject or delegated choice (disclose). Sidecar JSON: `"approved": true`. `<skill-dir>/scripts/ui-design build-phase advance` reads approval to close comps.

No code until approval. Finish review flags comps without recorded approval. Files under `.impeccable/mocks/decision/` are direction-round hand—not comp-round approval.

## After approval

Comp is a **translation** target, not permission to recompose. Do not rasterize core UI type/controls.

Measured build uses `<skill-dir>/scripts/ui-design comp-spec`, `<skill-dir>/scripts/ui-design comp-diff`, plate vs semantic rules—see new-work §6.

## Plates & embed-prompt

Before page code, produce plates:

```bash
<skill-dir>/scripts/ui-design comp-spec --crop <region-id>
<skill-dir>/scripts/ui-design comp-spec --plate-prompt <region-id> --background transparent   # or opaque
<skill-dir>/scripts/ui-design generate-image --ref <crop.png> --prompt-file <prompt.txt> --out <plate.png> --size <WxH> --quality high --background transparent
```

Parallel batch: spawn **exo-designer** with [degraded/asset-producer.md](degraded/asset-producer.md).

**Provenance** (required on every shipping raster):

```bash
<skill-dir>/scripts/ui-design embed-prompt <image> --prompt "<exact prompt string>"
<skill-dir>/scripts/ui-design embed-prompt <image> --prompt-file <file>
<skill-dir>/scripts/ui-design embed-prompt --read <image>
<skill-dir>/scripts/ui-design embed-prompt --scan <asset-dir...>
```

`generate-image` embeds automatically; native tools must run `embed-prompt` after. Stock/pre-existing rasters embed **origin** instead of prompt.

Image format conversion: use converter from context `IMAGE_TOOLS` line; probe at most once per session if none listed.

Return to the new-work playbook for direction contract, phased build, and finish handoffs.

---

## Session order & resume traps

Generating comps **before** `build-phase start` leaves artifacts outside phase state—resumed sessions will not have gates to advance. Always `start` first when the comps phase must close via `advance`.

Open every raster by **workspace-relative** path (sandboxed viewers reject absolute paths). Sidecars live beside each comp PNG as `<name>.json`.

**Sidecar fields (typical):**

```json
{
  "prompt": "<exact generation string>",
  "approved": false,
  "ref": "<optional screenshot path>",
  "size": "WxH",
  "quality": "high"
}
```

Set `"approved": true` only on the chosen comp after explicit user/consent.

---

## `generate-image` (API fallback)

Refuses writes under `.impeccable/mocks/` until `build-phase start` opened the comps phase (same rule for harness-native tools).

```bash
<skill-dir>/scripts/ui-design generate-image \
  --ref <screenshot-or-crop> \
  --prompt "<inline>" \
  --prompt-file <file> \
  --out <path.png> \
  --size <WxH> \
  --quality high|medium|low \
  --background transparent|opaque
```

- **`--ref`** — identity anchor (existing page screenshot or comp crop)
- **`--prompt` / `--prompt-file`** — mutually usable; file wins when both present
- **`--out`** — create parent dirs first
- **`--size`** — engine-supported dimensions matching viewport or plate aspect
- **`--background`** — pair with cutout vs full-frame semantics (see plates section)
- Embeds prompt into sidecar automatically on success

When `OPENAI_API_KEY` (or engine context) is missing, use harness-native image generation then manual `embed-prompt`.

---

## `embed-prompt` (provenance)

Required on **every shipping raster** the build creates or replaces; stock assets embed **origin** metadata instead of generation text.

```bash
<skill-dir>/scripts/ui-design embed-prompt <image> --prompt "<exact string sent to tool>"
<skill-dir>/scripts/ui-design embed-prompt <image> --prompt-file <file>
<skill-dir>/scripts/ui-design embed-prompt --read <image>
<skill-dir>/scripts/ui-design embed-prompt --scan <dir> [<dir>...]
```

Optional authoring helpers (when generating from comp discipline):

| Flag | Role |
|------|------|
| `--crop` | Crop reference tied to a region id before generation |
| `--plate-prompt` | Emit plate prompt text for a region |
| `--direction` | Seed key context for mock naming |
| `--kind` | `assigned` / `pick` / `challenger` / `canon` lineage |
| `--ref` | Reference image path for chained generation |
| `--size` | Target pixel box |
| `--quality` | Pass-through to provider |
| `--out` | Destination path when verb creates output |

`--scan` is read-only: lists files missing metadata; parent embeds or deletes abandoned rasters separately.

---

## Decision-page display

When three comps exist, prefer `<skill-dir>/scripts/ui-design serve-question` with one option card per comp (hero image = comp path). Text-only listing does **not** satisfy display when inline image UI exists.

Wait for approve · combine · revise · reject (or disclosed simulated user). **No implementation code** until approval is recorded on the sidecar and brief path is updated.
