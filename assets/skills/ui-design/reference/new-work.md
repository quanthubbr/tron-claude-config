# New visual work

This playbook covers **greenfield UI**, **major visual replacement**, and **full-page invention** inside an existing brand. Product facts live in `PRODUCT.md`; durable visual rules in `DESIGN.md`; route-specific strategy in the **surface brief**. No product file → run [init.md](init.md). Absent design file alone is **not** an automatic init redirect.

## 1 · Establish ground truth

Survey `DESIGN.md`, representative code, tokens, components, and assets.

| Situation | Stance |
|-----------|--------|
| **Redesign** | Keep truth, content, function, constraints, brand commitments; treat old look as anti-reference |
| **Established world** | Inherit; document incumbent identity instead of inventing |
| **Partial brand** | Preserve confirmed assets; expand with the user |
| **No authority** | Co-create a new world |

Local additions inherit their parent surface—never reboot identity for a small feature.

## 2 · Questions that move the build

Use the structured question tool when available; 2–3 focused questions or a tight confirmation. `DESIGN.md` fixes the world—not this surface’s purpose.

| Mode | Ask about |
|------|-----------|
| **Persuade** | Who acts, what proof earns belief, real assets |
| **Operate** | Task, states, frequency, constraints |
| **Read** | Reader goal, structure, wayfinding |
| **Experience** | What leads, exploration path, signature transition |

Always clarify success, must-not-touch areas, and what would feel wrong when polished. No CSS quizzes or canned aesthetic menus.

## 3 · Choose invention depth

### Extend an existing surface

Inherit world + composition. Resolve only new purpose, hierarchy, states, interaction, and join behavior. No concept tournament; no `DESIGN.md` edit without user approval of a system change.

### New whole surface (world already fixed)

Derive **5–7** structurally different layouts from content and behavior. For an open full page/flow:

```bash
<skill-dir>/scripts/ui-design concept-seed --scope surface --mode <mode>
```

The engine deals three structures for equal cards (kicker **THE ROLL**, steer, re-roll). With image gen + comp default (`.impeccable/config.json`), each card declares a comp under `.impeccable/mocks/decision/` per [visualize.md](visualize.md). Anchor identity via reference screenshot + structure-led prompt (`generate-image --ref`). Without images or under code-led default, cards carry `wireframe` schematics from:

```bash
<skill-dir>/scripts/ui-design serve-question --schema
```

Locked comp → comp-led with that comp as approved; locked wireframe → code-led via direction contract. Skip the script for narrow extensions.

### Create or replace the visual world

1. One sentence on mechanism, audience scene, cultural home, and what the first surface must prove—exclude category rut pages from the seven candidates.
2. List **seven** concrete visual systems/artifacts/places/rituals (≥3 material families; near-duplicates merge).
3. Fuse each into a full direction + first-surface expression.
4. **Mandatory roll** (no code before acknowledgment):

```bash
<skill-dir>/scripts/ui-design concept-seed --scope direction --mode <mode>
```

Fuse challengers with product facts; verdict **wins / competitive / declined** on audience identification + product clarity; declined challengers donate one discipline as a named raise on the assigned direction.
5. Present assigned direction (raises visible), ≤3 full-card challengers, optional **director pick** card when assigned ≠ your top pick (never lead; never two picks), demoted declined row, re-roll registers (**plain / safer / bolder** via `--register` + `--reroll`), quiet **canon** exit, `buildPath` toggle when image gen exists.

**Decision page transport:**

```bash
<skill-dir>/scripts/ui-design serve-question --start --payload <file>
<skill-dir>/scripts/ui-design serve-question --wait --key <key>
# reroll loop:
<skill-dir>/scripts/ui-design concept-seed --scope direction --mode <mode> --from <seed-key> --reroll <n>
<skill-dir>/scripts/ui-design serve-question --update --key <same-key> --payload <file>
```

Exit **4** → structured tool once, else unattended assigned direction (disclosed). Exit **2** from `--start` → structured tool fallback only.

**Reroll loop:** `ANSWER {"optionId":"reroll"}` keeps server alive—run `concept-seed` with same `--scope`/`--mode`, `--from <seed-key>`, `--reroll <n>` (increment n), rebuild payload, `serve-question --update --key <same> --payload <file>`, return to `--wait`. Never `--start` a second server.

**Canon exit:** category standard played straight—user’s door, never recommended. Taking canon → ask 2–3 reference products for craft bar; record preference in `PRODUCT.md` if standing.

**Pinned direction:** user/brief pins beat roll; translate material conflicts, do not re-roll for look mismatch alone.

**Image cards:** serve page first in least-sandboxed shell; comps generate in reading order (assigned → pick → hand → canon) with prompt sidecars; portrait frame for mobile/native-first, landscape for desktop; declined challengers skip comps. Parallel comps → **exo-designer** + [degraded/asset-producer.md](degraded/asset-producer.md) (≤4 in flight).

**buildPath:** read `.impeccable/config.json` (`.impeccable/config.local.json` overrides per machine). Default comp-led when image gen exists. Payload `buildPath: { "value": <default>, "toggle": true }`; ANSWER returns `buildPath` + `buildPathFlipped`. Mid-round flip to comp → `--wait` returns `BUILD PATH FLIPPED`; generate missing comps into declared paths then wait again. Record persistent default only when flip occurs on project with no stored `buildPath`—ask once after round closes.

## 4 · Commit the world

Color strategies: **Restrained** · **Committed** (30–60% field color) · **Full palette** · **Drenched**. Pick light/dark from a one-sentence physical scene—not defaults.

Typefaces should come from the subject’s world; overused “AI default” faces need explicit justification beyond category association.

Self-check: if the aesthetic is guessable from category alone, rework. Brief negatives forbid devices, not energy.

**Mode delivery checks:** **Persuade** — offer + action readable in form’s vocabulary within seconds. **Operate** — task/state/affordance never obscured. **Read** — comprehension + wayfinding intact. **Experience** — artifact leads from first viewport.

**Viability before roll:** true claims, real palette family, distinctive composition, full-surface scale within perf budget. Synthetic demo content OK when labeled; never invent prices, customers, capabilities, or endpoints.

## 5 · Record before code

Write **direction contract** under `## Direction contract` in the surface brief—six blocks (~150 words each):

| Block | Content |
|-------|---------|
| **THESIS** | Idea this surface owns; default arrangement it refuses |
| **OWN-WORLD** | Palette + component language recognizable without content |
| **STORY** | What visitor understands, believes, does |
| **FIRST VIEWPORT** | Composition, scale, primary action placement |
| **FORM** | Chosen form, list position, seed key from roll |
| **FINISH** | Verbatim: `unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance` |

Never embed the contract in shipped HTML/JSX/metadata.

New/replacement worlds: write `DESIGN.md` at **finish** via documenter—not pre-build. Extensions skip global `DESIGN.md` rewrites.

```bash
<skill-dir>/scripts/ui-design surface-brief read <primary-target>
<skill-dir>/scripts/ui-design surface-brief write <primary-target> <body-file> [related-target...]
```

Verify six blocks + seed key before building. Comp-led → [visualize.md](visualize.md) three-option round unless decision comp already approved. `shape` stops before persistence.
## 6 · Build with full commitment

Ship the assigned direction—not a timid reinterpretation. Rebuild nav, controls, and links in the chosen form’s vocabulary; stock components inside a committed form are lapses.

### Comp-led state machine

Start once (roll output names exact flags):

```bash
<skill-dir>/scripts/ui-design build-phase start --direction <seed-key> --kind <assigned|pick|challenger|canon>
# or when comp already approved:
<skill-dir>/scripts/ui-design build-phase start --comp <approved-comp>
```

Advance only through open gates:

```bash
<skill-dir>/scripts/ui-design build-phase advance
```

Exit **2** → gate failed (read message, fix, advance again). Do not write later phases while an earlier gate is open.

| Phase | Gate work |
|-------|-----------|
| **comps** | Three comps under `.impeccable/mocks/` + sidecar `"approved": true` ([visualize.md](visualize.md)); `start --comp` skips |
| **spec** | Measure comp (below) |
| **plates** | Raster regions before any page code |
| **hero** | First viewport at comp dimensions + diff gate |
| **sections** | Remainder in spec system |
| **motion** | Signature interaction once |
| **responsive** | Desktop 1280–1600 + mobile captures |

**Comp-led capacity note:** measured build holds layout numbers, plate boxes, and numeric hero diff across many attempts—frontier-tier work. If the active model tends to stall at ~recognizable pages, disclose before the direction round and prefer **code-led**, or expect hero gate failure with readings unmet.

**Phase discipline:** exit code **2** from any engine verb means the open gate failed—read stderr, fix, rerun **that** phase work, then `build-phase advance` again. Never author **sections**, **motion**, or **responsive** assets while **spec**, **plates**, or **hero** gates remain open.

**spec phase commands:**

```bash
<skill-dir>/scripts/ui-design comp-spec --comp <comp> --grid
<skill-dir>/scripts/ui-design comp-spec --comp <comp> --regions <regions-file>
<skill-dir>/scripts/ui-design comp-spec --print
<skill-dir>/scripts/ui-design font-match --measure <text-region-id>
<skill-dir>/scripts/ui-design font-match --rank <region-id> --text "..." [--candidates <faces...>]
```

Regions file: kinds `plate` / `image` / `texture` for painted ink; `text` / `control` / `chrome` for code; every region has `note`. Oversized text regions must split. `--snap` behavior and explicit `box` as documented by engine.

**Spec gate rules (engine-enforced, paraphrased):**

- Every visible ink blob gets a region; unnamed comp material is refused.
- `text` / `control` / `chrome` larger than ~¼ of comp area must decompose into inner regions (columns are not single elements).
- Notes describing painted illustration/photo/texture under a code kind → reclassify as raster kind or rewrite note.
- Lead text region must be **measured** and **ranked** via `font-match`; never hand-write `chosen` faces into spec.
- Icon-sized SVG only under ~64px and few paths; diagrams, notation, leader art → plates.
- Spec is exhaustive: no invented borders/chrome absent from comp except font substitution, icon glyph substitution, and comp typos flagged as defects.
- Plate boxes must contain full artwork (`bleed: true` only when page truly crops there).

**Output artifact:** `.impeccable/build/spec.json` — authoritative for hero scaffold, diff, and polish advisories.

**plates phase commands:**

```bash
<skill-dir>/scripts/ui-design comp-spec --crop <region-id>
<skill-dir>/scripts/ui-design comp-spec --plate-prompt <region-id> --background transparent
<skill-dir>/scripts/ui-design comp-spec --plate-prompt <region-id> --background opaque
<skill-dir>/scripts/ui-design generate-image --ref <crop.png> --prompt-file <prompt.txt> --out <plate.png> --size <WxH> --quality high --background transparent
<skill-dir>/scripts/ui-design embed-prompt <plate> --prompt-file <prompt.txt>
```

Parallel plates → **exo-designer** + [degraded/asset-producer.md](degraded/asset-producer.md). Comp crop is reference only—not shipping pixels. `--force` only when user downgrades comp authority (quote reason).

**hero phase commands:**

```bash
<skill-dir>/scripts/ui-design build-phase scaffold
<skill-dir>/scripts/ui-design build-phase record hero
<skill-dir>/scripts/ui-design comp-diff --comp <comp> --build <capture> --spec <spec.json> --out-dir .impeccable/review/diff/hero/
```

Scaffold writes `.impeccable/build/scaffold/layout.css` with `--r-<id>-x/y/w/h` (and measured type). Hero gate ~**72%** overall match with no hard vetoes (missing region, contradicted plate/text, SVG illustration posing as plate, clipped plate, invented ink). `comp-diff` writes side-by-side, heatmap, paired crops, `report.json` under `.impeccable/review/diff/hero/`. Advisories quote numeric deltas (cap height, line count, weight, ink color, chrome height). On failure, open listed region crops in order: `missing` → add material; `contradicted` → re-derive structure; `drift` → size/spacing edits. Gate refuses a third attempt that only nudges the same region without structural change.

**Plate rules recap:** comp crop never ships; plates ≥1.5× region size; page code waits for plates gate—CSS-drawn material before plates exist is invalid. Icon-sized SVG (<64px, few paths) OK; diagrams/notation must be plates. Callout lines belong to plate; labels stay text. `--force` on gates only with user-quoted comp downgrade in `--reason`.

**responsive captures:** `desktop.png` (1440 full page), `mobile.png` (390) under `.impeccable/review/`.

### Code-led

No comp required; finish reviewer audits **FIRST VIEWPORT** + signature interaction. Decision comp may ride as critique reference only.

### Shared build rules

First viewport demonstrates mechanism—not generic hero shell. Prove with demonstration; author assets; build named techniques (canvas, WebGL, view transitions) for real; pace scroll density; verify imagery URLs; orchestrate motion once. Preserve a11y, performance, semantics, project conventions.

## 7 · Inspect and finish

One batched screenshot round (web desktop+mobile; native device classes; add user viewport width when harness reports it). Two rounds max; batch fixes. Comp-led final diff:

```bash
<skill-dir>/scripts/ui-design comp-diff --comp <approved-comp> --build .impeccable/review/desktop.png --spec .impeccable/build/spec.json --out-dir .impeccable/review/diff/final
```

Validate captures (motion settled, full page, correct dimensions). Hookless web: `<skill-dir>/scripts/ui-design detect --json` on changed targets once before handoff. Native: no HTML detector—say so in reviewer packet.

Screenshots → `.impeccable/review/` (`desktop.png`, `mobile.png`, `user-<w>.png`, native per class).

Spawn **exo-designer** + [degraded/finish-reviewer.md](degraded/finish-reviewer.md) with request, contract, artifact path, screenshots, hook findings, QUALITY BAR paths, comp/spec/diff paths, craft-floor path, platform refs. Fresh subagent, no forked transcript; one long wait; respawn once if empty. No subagents → in-thread degraded brief (disclose).

Dispositions: **recapture** · **rebuild** · **ship** · **fix** (verdict pass on listed fixes; two unattended verdict rounds max).

Before fix/rebuild return to reviewer:

```bash
<skill-dir>/scripts/ui-design embed-prompt --scan <asset-dir...>
```

Then **exo-designer** + [degraded/documenter.md](degraded/documenter.md): new worlds need token `DESIGN.md` **and** `.impeccable/design.json`. Manual edits from review → [degraded/manual-edit-applier.md](degraded/manual-edit-applier.md) when available.

## Engine CLI quick reference

All via `<skill-dir>/scripts/ui-design <verb>`. Common flags:

| Verb | Flags / notes |
|------|----------------|
| `concept-seed` | `--scope surface\|direction`, `--mode`, `--from`, `--reroll`, `--register` |
| `serve-question` | `--start`, `--wait`, `--key`, `--update`, `--payload`, `--schema` |
| `build-phase` | `start --direction`, `start --comp`, `advance`, `scaffold`, `record hero` |
| `comp-spec` | `--comp`, `--grid`, `--regions`, `--print`, `--crop`, `--plate-prompt`, `--background transparent\|opaque` |
| `comp-diff` | `--comp`, `--build`, `--spec`, `--out-dir` |
| `font-match` | `--measure`, `--rank`, `--text`, `--candidates` |
| `generate-image` | `--ref`, `--prompt-file`, `--out`, `--size`, `--quality`, `--background` |
| `embed-prompt` | `<image>`, `--prompt`, `--prompt-file`, `--read`, `--scan` |
| `detect` | `--json`, targets |
| `surface-brief` | `read`, `write` |

Scaffold layout vars: `--r-<id>-x`, `--r-<id>-y`, `--r-<id>-w`, `--r-<id>-h` plus measured cap height, font-size, family, weight.

---

## Decision page payload & flow

Build JSON payload files for `<skill-dir>/scripts/ui-design serve-question`:

1. **`--schema`** — dump wireframe card schema when image gen unavailable.
2. **`--start --payload <file>`** — boots local decision server; exit **2** → fall back to structured AskUserQuestion once.
3. **`--wait --key <key>`** — blocks until ANSWER; preserve **same key** across rerolls.
4. **`--update --key <key> --payload <file>`** — replace cards after reroll without second `--start`.

**ANSWER handling highlights:**

| `optionId` | Parent action |
|------------|----------------|
| assigned / pick / challenger / canon | Record seed key + kind; run printed `build-phase start` |
| `reroll` | `concept-seed --from <seed-key> --reroll <n>` then `--update` payload |
| safer / bolder steers | Use `--register` lines from seed output when present |
| `buildPath` toggle | Honor flip: generate missing comps if switched to comp-led mid-round |

Exit **4** from `--wait` → one structured tool attempt, else proceed on assigned direction with disclosure.

**Image card order:** assigned → director pick → hand challengers → canon (canon comp only if user selects canon). Declined challengers skip comp generation. Serve page in least-sandboxed shell before generating images.

---

## Sections · motion · responsive (gates 4–6)

**sections** — Extend surface using spec palette, corner language, and line weights only; regions absent from comp inherit the recorded system—do not freestyle new chrome families.

**motion** — One orchestrated signature (scroll reveals, hero mechanism, primary transition)—not scattered hovers. Respect reduced-motion preferences in shipping code.

**responsive** — Fluid columns; no fixed grid that breaks ~100px below comp width. Captures:

| File | Spec |
|------|------|
| `desktop.png` | 1440px wide, full page, under `.impeccable/review/` |
| `mobile.png` | 390px wide, full page |
| `user-<w>.png` | When harness reports user viewport |

Gate compares desktop first viewport to comp—not only exact comp pixel width. Mobile-first comps were portrait; plates target that frame.

---

## Finish dispositions (expanded)

| Word | Meaning | Next step |
|------|---------|-----------|
| **recapture** | Evidence invalid (blank, motion-hidden, wrong crop) | Re-shoot listed views; full review again |
| **rebuild** | Wholesale fidelity failure | Re-derive named regions/assets; fresh full review (not verdict-only) |
| **ship** | Verdict clean at stated scope | Documenter handoff |
| **fix** | Bounded patch list | Batch edits → rebuild once → recapture → **verdict pass** on listed fixes only |

Verdict pass caps at **two unattended rounds**; user may fund more when attended. Reviewer findings are the sole fix list—no parallel self-audit. User-supplied screenshot contradicting your capture → fresh reviewer with their evidence.

**Raster hygiene on fix/rebuild:** embed prompts via `--scan` on asset dirs; delete abandoned rasters in same batch; never delete files scan flagged as missing metadata without embedding first.

---

## Engine flags (complete reference)

| Verb | Flags |
|------|-------|
| `concept-seed` | `--scope surface\|direction`, `--mode <mode>`, `--from <seed-key>`, `--reroll <n>`, `--register <steer>` |
| `serve-question` | `--start`, `--wait`, `--key`, `--update`, `--payload <file>`, `--schema` |
| `build-phase` | `start --direction`, `start --comp`, `advance`, `scaffold`, `record hero` |
| `comp-spec` | `--comp`, `--grid`, `--regions`, `--print`, `--crop`, `--plate-prompt`, `--background transparent\|opaque`, `--force`, `--reason` |
| `comp-diff` | `--comp`, `--build`, `--spec`, `--out-dir` |
| `font-match` | `--measure <region>`, `--rank <region>`, `--text "..."`, `--candidates <faces...>` |
| `generate-image` | `--ref`, `--prompt`, `--prompt-file`, `--out`, `--out-dir`, `--size`, `--quality`, `--background`, `--crop`, `--plate-prompt`, `--direction`, `--kind` |
| `embed-prompt` | `<image>`, `--prompt`, `--prompt-file`, `--read`, `--scan`, `--ref`, `--size`, `--quality`, `--out` |
| `detect` | `--json`, markup paths |
| `surface-brief` | `read`, `write` |

**Hero scaffold CSS variables:** `--r-<id>-x`, `--r-<id>-y`, `--r-<id>-w`, `--r-<id>-h`, plus measured typography tokens per text region.

---

## Reading `comp-diff` output

Hero and final diffs emit under `.impeccable/review/diff/<phase>/`:

| Artifact | Use |
|----------|-----|
| Side-by-side PNG | Human sanity check; not sufficient alone |
| Heatmap | Shows spatial drift clusters |
| Per-region crop pairs | Open in listed order on failure |
| `report.json` | Machine scores: overall %, veto flags, per-region status |

Region statuses drive edits: **`missing`** → add element/plate; **`contradicted`** → rebuild structure from spec box; **`drift`** → numeric spacing/type tweaks. Advisories after pass (cap height delta, line count, ink color, chrome height) feed polish before responsive—not excuses to skip hero rework when veto bits are set.
