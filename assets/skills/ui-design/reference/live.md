Live variant mode: pick elements in the browser, choose a design action, and receive HTML+CSS variants hot-swapped through the dev server’s HMR.


```live-protocol
## Before you start

Need HMR (Vite, Next, Bun, …) or local static HTML. Busy default port usually means the app is already running—try its URL before starting another.

Live editing needs a local checkout; injecting into deployed production (including HTTPS) is unsupported. Inspect production with `<skill-dir>/scripts/ui-design detect <url>` or the browser extension—not the live helper. Do not weaken browser security or production CSP for live mode.

## Ordered contract (mandatory)

Run steps in order—none skipped, none reordered. Live tool JSON may include `_instructions`: authoritative next action for that moment, with real ids/paths filled in. When `_instructions` disagrees with this doc, `_instructions` wins.

1. `ui-design live`: boot. If the request names or implies a file, route, or app inside a monorepo, infer the concrete path and run `<skill-dir>/scripts/ui-design live --target <path>` instead; then run the rest of this live session from the returned `projectRoot`. The boot resolves the app root from dev-server config files and persists it in `.impeccable/live/roots.json`; every helper re-anchors to that manifest at startup (a wrong cwd cannot fork session state), PRODUCT.md / DESIGN.md are discovered upward to the git root, and relative helper args like `--file` resolve against the app root.
2. Open the URL that serves `pageFile` (infer from `package.json`, docs, terminal output, or an open tab). `serverPort` is the helper port—not the app origin. **Cursor:** `browser_navigate` to that URL before polling; do not skip. **Other harnesses:** use the available browser tool; if the URL is uncertain, ask the user once.
3. Poll with default long timeout (600000 ms). Run `ui-design live-poll` immediately after every event or `--reply`; Codex runs one-shot poll in foreground. Never pass short `--timeout=`. The global bar’s **live indicator** dims with pulsing amber when nothing polls `/poll`; restart `ui-design live-poll` to reconnect.
4. On `generate`: reuse `event.scaffold` when present; read the screenshot if present; load the action's reference; deliver variants; `--reply done`; poll again. Generate variants in this thread: you already hold the project's tokens and layout. Treat overlay preview as verification—no extra QA between generate and accept; do not screenshot, re-render, or QA variants between generate and accept. Apply craft-floor's contrast, spacing, and type floors by construction as you write; full verification runs once at accept on the chosen variant.
5. On steer: read `message` and `pageUrl`; do the work; `--reply steer_done`; poll again. No pickup ack.
6. On `accept` / `discard`: poll script runs `ui-design live-accept`, acks delivery, prints `_completionAck`. Plain accept/discard ends immediately; carbonize accepts stay recoverable until `ui-design live-complete --id EVENT_ID`. Finish cleanup before polling again.
7. If interrupted, run `ui-design live-status` or `ui-design live-resume` before guessing. Journal under `.impeccable/live/sessions/` is canonical durable state; replays unacked work after helper restart; injected `live.js` re-attaches on page reopen. Direct-edit fallback only when `ui-design live-resume` reports no active session—not because disconnects felt frequent.
8. On `exit`: run the cleanup at the bottom.

Runtime harness rules:
- **Claude Code**: run the poll as a **background task** (no short timeout); the harness notifies you on completion. Do not block the shell.
- **Cursor**: **one-shot** poll in a **background terminal** with notify on `"type":"(steer|generate|accept|discard|manual_edit_apply|variant_mount_failed|prefetch|exit)"`; handle, `--reply`, restart the poll. Do **not** use `--stream` on Cursor (measured ~5s pickup vs sub-second one-shot).
- **Codex**: default one-shot poll in a **yielded foreground exec session**. No `&`, no `--stream`, never leave Live without an active foreground poll. Starting the poll is not enough: SERVICE it (keep reading the exec session until it returns an event). Never announce "waiting for the user" and idle; a yielded poll nobody reads is a dead session, and the user's Go sits unanswered.
- **Other harnesses**: one-shot foreground unless you know stdout reliably returns when a shell exits.

Delivery policy: atomic single-edit delivery everywhere; do not switch a harness to progressive publishing unless its poll loop is known not to block on the extra calls.

Keep chat minimal. No recap, no tutorial output, no pasting PRODUCT / DESIGN bodies. Spend tokens on tools and edits; on failure, one or two short sentences.


## Polling cycle

```
LOOP:
  <skill-dir>/scripts/ui-design live-poll   # default long timeout; no --timeout=
  Read JSON; dispatch on "type"

  "generate"  → Handle Generate; reply done; LOOP
  "steer"     → Handle Steer; reply steer_done; LOOP
  "accept"    → Handle Accept; complete carbonize cleanup if required; LOOP
  "discard"   → Handle Discard; LOOP
  "prefetch"  → Handle Prefetch; LOOP
  "manual_edit_apply" → Handle Manual Edit Apply; reply done|partial|error; LOOP
  "variant_mount_failed" → Fix the variant files; reply done --file <path>; LOOP
  "timeout"   → LOOP
  "exit"      → break → Cleanup
```

`variant_mount_failed` means the browser could not render what you published (`variant`, module `url`, `error`). The user sees a persistent error card, not variants. Fix the variant files, then `--reply EVENT_ID done --file <manifest or source path>`; the browser retries on its own.

**Stream mode** (`--stream`, experimental, never on Cursor): one long-lived process, one JSON line per event, `--reply` from a separate command. Only for harnesses that read incremental stdout reliably.


## Start

```bash
<skill-dir>/scripts/ui-design live
```

Output JSON: `{ ok, serverPort, serverToken, pageFiles, roots, hasProduct, product, productPath, hasDesign, design, designPath, hasSurfaceBrief, surfaceBrief }`. `roots` is the resolved root manifest; `projectRoot` mirrors `roots.appRoot`. The surface brief rides along; do not shell out to `ui-design surface-brief` separately. Precedence for generation: **DESIGN.md wins on visual decisions; PRODUCT.md wins on durable product and voice decisions; the surface brief wins on this surface's strategy.** When DESIGN.md is missing, identity is **not** absent; extract it from CSS variables, computed styles, and sibling components (Step 4 Phase A). Identity preservation is the default; departure requires the user's explicit redesign intent.

`serverPort`/`serverToken` belong to the small helper HTTP server (`/live.js`, SSE, `/poll`), not your dev server; the page URL is whatever origin serves a `pageFiles` entry.

If output is `{ ok: false, error: "config_missing" | "config_invalid", path }`, this project needs one-time configuration: read [live-setup.md](live-setup.md) and follow it. If the output carries a non-null `configDrift`, tell the user once which HTML files are uncovered and suggest adding them or switching `files` to a glob; never auto-edit the config.


## Resume helpers

The append-only journal under `.impeccable/live/sessions/` is canonical durable state (not project source). When the chat was interrupted, polling was missed, the helper restarted, or the browser reloaded:

```bash
<skill-dir>/scripts/ui-design live-status      # helper state, active sessions, queued events; works with the helper down
<skill-dir>/scripts/ui-design live-resume --id SESSION_ID   # active snapshot, pending event, next safe action
<skill-dir>/scripts/ui-design live-complete --id SESSION_ID # canonical manual final acknowledgement after verified cleanup
```

Server restart rule: start `ui-design live-server` again, then poll; startup requeues unacknowledged events, so never ask the user to click Go again unless `ui-design live-resume` says no active session exists.


## On `generate` events

**Standard replace flow** (default): `{id, action, freeformPrompt?, count, pageUrl, element, screenshotPath?, comments?, strokes?}`.

**Net-new insert flow** (`event.mode === "insert"`): `{id, mode: "insert", count, pageUrl, insert: { position, anchor }, placeholder: { width, height }, freeformPrompt?, screenshotPath?, comments?, strokes?}`. No `action`; requires a non-empty `freeformPrompt` **or** annotations. `placeholder` is a soft size hint.

User waits on the selection—move quickly the selected element. Reuse preflight metadata, minimize discovery calls.

### Net-new insert flow branch

1. Read the screenshot if present (annotations only).
2. If `event.scaffold` is present, use it and do **not** run the helper again. Otherwise:

```bash
<skill-dir>/scripts/ui-design live-insert --id EVENT_ID --count EVENT_COUNT --position after \
  --element-id "ANCHOR_ID" --classes "class1,class2" --tag "section" --text "ANCHOR_TEXT"
```

`--position` ← `event.insert.position`; anchor flags map exactly like wrap's. The scaffold has no `data-impeccable-variant="original"` slot; variants are net-new HTML+CSS at `insertLine`. On source-preview targets the scaffold carries `sourceWritten: false` with `wrapperBlock` and `replaceEndLine < replaceStartLine` (an insertion): splice variants into `wrapperBlock` at the marker and insert at `replaceStartLine` in ONE edit, exactly as the wrap section describes. Decide the visitor mode from the surface and load [craft-floor.md](craft-floor.md) before writing net-new markup. Svelte targets follow the same component flow as wrap below (`mode: "insert"` in the manifest): each variant is a real single-root component under `componentDir` without live DOM scaffolding attrs; never edit the route during generation; accept splices the chosen markup into `sourceFile` mechanically. For non-Svelte targets, accept/discard removes the wrapper; the anchor is untouched.

### Standard replace flow (default)

### 1. Read the screenshot (if present)

`event.screenshotPath` is sent **only when the user annotated before Go**; it is a PNG of the element with annotations baked in. Read it before planning. When absent, do not ask for one or screenshot the page yourself: without annotations a screenshot anchors you on the existing design and fights the three-distinct-directions brief; work from `element.outerHTML`, the computed styles, and the prompt.

Annotation semantics: a comment's `{x, y}` is element-local and binds the text to the child under that point (a comment near the title is about the title). Comments and strokes are independent unless clearly paired. Strokes read by shape: closed loop = "this thing" (emphasis, not a clipping region); arrow = direction or movement; cross/slash = delete; scribble = emphasis or delete by context. If a stroke's intent is genuinely ambiguous and it changes the brief, ask one short question before generating; otherwise state your reading in one sentence.

### 2. Wrap the element

When `event.scaffold` is present, the helper already found the source and computed the wrapper; treat it as the successful output and skip the command. `event.scaffoldAttempted` with `scaffoldError` means preflight could not finish; use the command below.

**On source-preview targets `event.scaffold` carries `sourceWritten: false`.** The helper did NOT write the wrapper; it hands you `scaffold.wrapperBlock` plus the picked element's source range (`replaceStartLine`, `replaceEndLine`, 1-indexed). Write the wrapper **and** all variants in ONE edit: splice your variants into `wrapperBlock` at the "Variants: insert below this line" marker, then replace lines `[replaceStartLine, replaceEndLine]` with the result. A separate scaffold write reloads the framework before your variant write lands and strands the browser at 0/N. (`replaceEndLine < replaceStartLine` means insert mode: insert, remove nothing.) The `svelte-component` path never sets `sourceWritten`.

```bash
<skill-dir>/scripts/ui-design live-wrap --id EVENT_ID --count EVENT_COUNT --element-id "ELEMENT_ID" --classes "class1,class2" --tag "div" --text "TEXT_SNIPPET"
```

Flag mapping (keep separate, never collapse into `--query`): `--element-id` ← `event.element.id`; `--classes` ← classes joined with commas; `--tag` ← tagName; `--text` ← first ~80 chars of textContent, **every call**: it disambiguates repeated sibling components, without it wrap lands on the first match. If `event.pageUrl` implies the file, pass `--file PATH`. If `--text` still matches several candidates, wrap exits `{ error: "element_ambiguous", candidates, fallback: "agent-driven" }`: pick the right range from page context and write the wrapper manually per the fallback flow.

Success output: `{ file, insertLine, commentSyntax, styleMode, styleTag, cssSelectorPrefixExamples, cssAuthoring }` (plus the `sourceWritten: false` fields above on source-preview targets). Run directly with no preflight scaffold, it writes the wrapper itself and you splice variants at `insertLine`. `styleMode` controls how preview CSS must be authored. Treat it as a detected capability mode, not a framework guess: `scoped` means `@scope` rules bound to the variant root selector from `cssAuthoring.rulePattern`; `astro-global-prefixed` means explicit per-variant selector prefixes using the exact returned `styleTag`. Use `cssAuthoring` as the source of truth for the current file (styleTag, selector strategy, requirements, forbidden patterns); apply no framework-specific exception unless it says to.

For Svelte/SvelteKit targets, `ui-design live-wrap` returns `previewMode: "svelte-component"` with `file` pointing at a temporary `node_modules/.impeccable-live/<id>/manifest.json`, `componentDir` holding the variant components, and `sourceFile` the real route. The scaffold is AST-based: control-flow blocks (`{#each}`, `{#if}`) survive intact and a free each-collection crosses the contract as ONE structured prop (kind `collection`). The payload includes `componentStubMarkup` (the prop-substituted markup already written into every stub), so do not read the manifest or stubs back. EDIT `v1.svelte`, `v2.svelte`, ... in place; never delete and recreate them; keep the stub's control flow and `propContract` prop names; never flatten a loop into literal items. The stub `<style>` arrives seeded with the source rules that currently style the selection; restyle or delete them freely. On accept, any seeded rule your variant does not re-declare is REMOVED from the source (the preview never applied it, so the user approved a design without it). Use semantic class selectors, no `@scope`, no `engine live data-* attrs`. Reply with `--file` set to the manifest path; the browser mounts the compiled components so Svelte HMR does not reset page state. Accept merges the chosen component back mechanically (markup restored to route expressions, CSS reconciled, params baked, indentation preserved); you have no post-accept cleanup on this path. When the selection contains constructs a detached preview cannot support (component tags, `bind:`/`use:`, await blocks, inline scripts, spread attributes), wrap returns the normal source-preview wrapper with `previewFallback: { from: "svelte-component", reason }`; just follow the returned shape.

**Params on component-preview paths go in a sidecar, never as an attribute** (Svelte parses `{` in attribute values as an expression). Declare them in `componentDir/params.json` keyed by variant number, using the schema from section 7:

```json
{ "1": [ {"id":"density","kind":"steps","default":"snug","label":"Density","options":[
    {"value":"airy","label":"Airy"},{"value":"snug","label":"Snug"} ]} ] }
```

Author the component `<style>` against `var(--p-<id>, default)` for `range`/`toggle` and `[data-p-<id>="…"]` for `steps`, wrapped in `:global(...)` so runtime knob values on the mounted root reach your rules.

**Fallback errors.** Wrap refuses to write into non-source files (generated, untracked): accepting into one is silent data loss. Three shapes, all with `fallback: "agent-driven"` (see **Agent-driven fallback**): `file_is_generated` (your `--file` points at a generated file), `element_not_in_source` with `generatedMatch` (element only exists generated), `element_not_found` (likely runtime-injected).

### 3. Load the action's reference

When `event.action` is the freeform token: work from SKILL.md's design rules plus [craft-floor.md](craft-floor.md); decide the visitor mode from the surface; do not load a sub-command reference. Freeform is not a pass to skip parameters: follow the budget and freeform bias in section 7. Any other action (`bolder`, `quieter`, `distill`, `polish`, `typeset`, `colorize`, `layout`, `adapt`, `animate`, `delight`, `overdrive`): read `reference/<action>.md` before planning; its MUST params layer on top of the section 7 budget.

### 4. Plan three variants: identity first, then mode, then axes

Live runs on an existing surface; the brand is already chosen. The job is variation **within identity**, not selection between identities. The worst failure is three off-brand variants the user cannot accept. Four phases, in order.

#### Step A — identity lock: Extract the identity (non-skippable)

Sources in priority order: DESIGN.md's visual system fields; CSS custom properties (de-facto tokens); computed styles on the picked element and parent; sibling components' visual rhetoric. Write ONE sentence recording what is actually on screen: dominant surface and accent color (real values, not "warm"), the loaded font pairing, layout topology (stacked / side-by-side / grid / asymmetric / overlay), surface treatment (corners, borders, shadows, decoration density), and the voice tone read off the copy. Be specific; skip an axis rather than fabricate; do not name an aesthetic family (a conclusion, not data). This sentence is the **identity lock**: every variant must read as the same brand side by side. Absence of DESIGN.md is never an excuse.

#### Step B — mode pick: Pick mode (default vs departure)

**Default** preserves the identity and varies expression within it; right for ~90% of sessions. **Departure** rejects the identity; trigger ONLY on the user's explicit ask in the current request or prompt ("redesign this", "rebuild from scratch", "something completely different"); a stale critique or old note is not authorization. Unsure means default: wrong-default costs "three on-brand variants with similar feel" (recoverable), wrong-departure costs three off-brand variants (unrecoverable).

#### Step C — three variants: Plan three variants

**When staying on-brand.** Each variant commits to a different **primary axis**, preserving the identity sentence. The six axes: 1 **Hierarchy** (which element commands the eye), 2 **Layout topology** (stacked / side-by-side / grid / asymmetric / overlay), 3 **Typographic system** (pairing logic, scale ratio, case/weight, *within the available faces*), 4 **Color strategy** (which existing palette role carries the surface: Restrained / Committed / Full palette / Drenched; existing tokens only), 5 **Density** (minimal / comfortable / dense), 6 **Structural decomposition** (merge, split, progressive disclosure). Three variants, three DIFFERENT axes: the same brand at three angles. New fonts, new hues, or new aesthetic-family signals belong to departure mode only.

**When user explicitly redesigns.** Each variant anchors to a different aesthetic direction derived from the brand, never a fixed catalog: read PRODUCT.md's Brand Personality words; derive physical, spatial, or material experiences that embody them; from those, derive three directions genuinely different from each other AND from the current surface; reject reflex choices whose rationale would fit a neighboring product. Each direction must be one concrete sentence naming a real-world referent ("a museum exhibition label system", not "clean and minimal").

**In both modes, name each variant's 2 or 3 parameter knobs while planning** (section 7 budget). Parameters are part of the design; deciding "what's tunable" during planning beats retrofitting.

#### Step D — squint test: Squint test

**Default:** compare each variant against the Phase A lock; palette, type voice, or rhetoric drift means it crossed into departure by accident: rework. Then confirm three different primary axes; three "tighter density" variants is failure. **Departure:** two passes, family before sentence. Family pass (non-negotiable): label each variant with a concrete family of your own choosing; shared or interchangeable labels mean rework. Sentence pass: three one-line descriptions side by side; two that rhyme mean rework. When the primary axis is color or theme, the trio must not share theme + dominant hue: three color worlds, not three shades.

**Action-specific invocations** must vary along the action's dimension:

- `bolder`: amplify a different dimension per variant (scale / saturation / structural change).
- `quieter`: pull back a different dimension (color / ornament / spacing).
- `distill`: remove a different class of excess (visual noise / redundant content / nested structure).
- `polish`: a different refinement axis (rhythm / hierarchy / micro-details).
- `typeset`: different pairing AND different scale ratio each.
- `colorize`: different hue family each; vary chroma and contrast strategy.
- `layout`: different structural arrangement, not spacing tweaks.
- `adapt`: different target context per variant (mobile-first / tablet / desktop / print or low-data).
- `animate`: different motion vocabulary (cascade stagger / clip wipe / scale-and-focus / morph / parallax).
- `delight`: different flavor of personality (micro-interaction / typographic surprise / illustrated accent / sonic-or-haptic / easter egg).
- `overdrive`: different convention broken (scale / structure / motion / input model / state transitions); skip its "propose and ask" step, live is non-interactive.

### 5. Apply the freeform prompt (if present)

`event.freeformPrompt` is the user's ceiling on direction: all variants honor it while exploring different interpretations within the Phase B mode. Default mode: the prompt narrows the axes, not the identity ("more confident" → one variant amplifies hierarchy, one commits the accent color, one tightens density). Departure mode: the prompt narrows the lanes, not the families ("newspaper front page" → broadsheet vs tabloid vs trade journal, then run the family pass). When the prompt conflicts with a binding brand commitment or DESIGN.md invariant, preserve the invariant unless the user explicitly revokes it.

### 6. Deliver variants

Complete HTML replacement of the original element per variant, not a CSS-only patch. Colocate preview CSS as a `<style>` tag inside the wrapper. **Atomic default:** CSS + all variants + parameter manifests in one edit at `insertLine`.

Shape inside the wrapper `live-wrap` emitted (swap in `cssAuthoring.styleTag` if the tool returns a different opening tag):

```html
<style data-impeccable-css="SESSION_ID">
  @scope ([data-impeccable-variant="1"]) { :scope > .card { /* variant 1 */ } }
  @scope ([data-impeccable-variant="2"]) { :scope > .card { /* variant 2 */ } }
</style>
<div data-impeccable-variant="1"><!-- one top-level element, same tag as the original --></div>
<div data-impeccable-variant="2" style="display: none"><!-- … --></div>
<div data-impeccable-variant="3" style="display: none"><!-- … --></div>
```

Never invent other marker names.

Replace the style opening tag with `cssAuthoring.styleTag` when the tool returns a different one. **Each variant div contains exactly one top-level element**, same tag as the original; loose siblings break outline tracking and accept. First variant visible, all others `display: none`. The browser's MutationObserver accepts atomic or progressive arrival; accepting an arrived variant fences the worker, so later publications are rejected.

For `styleMode: "scoped"`, author every `:scope` rule with a descendant combinator: the `@scope` boundary is the variant wrapper div, not your element, so a bare `:scope { ... }` styles a `display: contents` shell. Always step in (`:scope > .card`, `:scope .hero-title`).

**JSX / TSX targets:** wrap `<style>` in a template literal, use `className` / `style={{…}}`, keep `data-impeccable-*` attributes as plain strings (e.g. `<div data-impeccable-variant="2" style={{ display: 'none' }}>`). The wrap script provides a single-rooted JSX wrapper with marker comments inside; drop the block at the marker and the source stays valid TSX.

### 7. Parameters (composition-sized, 0-4 per variant)

Each variant can expose **coarse** knobs; the browser docks one control per parameter with zero regeneration cost (knobs drive a CSS variable or data attribute your scoped CSS is authored against). Wire an axis as soon as the user could plausibly mutter "a bit tighter" or "a touch more accent" without wanting a regeneration; micro-margins and one-off nudges are not parameters. Freeform bias: you chose the axes, so expose them; a hero with 0 params is almost always a mistake, and 1 is underweight unless the design is a genuine fixed point.

Budget scales with the element's VISUAL weight (count visual children, not DOM depth):

- **Leaf / tiny** (button, icon, bare heading): **0 params.**
- **Small composition** (simple card, labeled input, ≤ ~5 visual children): **0-1**.
- **Medium composition** (section, nav cluster, 6-15 children): **target 2**; 1 if simple.
- **Large composition** (hero, full region, 16+ children or sub-sections): **target 2-3, up to 4** when independent axes are all authored in CSS.

**Hard cap: four** per variant. For named sub-commands, the action reference's MUST params are non-negotiable when expressible; respect the cap, no duplicate knobs.

**Declare** on the HTML/JSX path as a wrapper attribute (component-preview paths use `componentDir/params.json` instead, same schema, keyed by variant number; see the wrap section):

```json
[
  {"id":"color-amount","kind":"range","min":0,"max":1,"step":0.05,"default":0.5,"label":"Color amount"},
  {"id":"serif","kind":"toggle","default":false,"label":"Serif display"}
]
```
Attach it to the variant root as `data-impeccable-params='[...]'` (single-quoted so the JSON's double quotes survive).

Three kinds: `range` (slider; drives `--p-<id>`; author `var(--p-color-amount, 0.5)`; fields min/max/step/default/label), `steps` (segmented radio; drives `data-p-<id>`; author `:scope[data-p-density="airy"] .grid { ... }`; fields options/default/label), `toggle` (drives both `--p-<id>: 0|1` and attribute presence; fields default/label). Reset on variant switch is a known limitation: each variant starts at its declared defaults.

**On accept**, the browser sends current values and `ui-design live-accept` writes them as a sibling comment: `<!-- impeccable-param-values SESSION_ID: {"color-amount":0.7} -->`. Carbonize cleanup bakes them: keep only the matching `steps`/`toggle` branch, drop the others, collapse `:scope[data-p-…]` to semantic rules; substitute `range` literals or update the var's default.

### 8. Signal done

```bash
<skill-dir>/scripts/ui-design live-poll --reply EVENT_ID done --file RELATIVE_PATH
```

`RELATIVE_PATH` is relative to project root; the browser fetches source directly if the dev server lacks HMR. Then poll again immediately.

### Aborting an in-flight session

If wrap or generation fails after the browser flipped to GENERATING, tell the **browser** so its bar resets: `<skill-dir>/scripts/ui-design live-poll --reply EVENT_ID error "Short reason"`. Never use `live-accept --discard` for this (pure file mutator, browser never sees it, bar sticks on dots); `--discard` is only source-side cleanup for a discard the browser itself initiated.


## Agent-driven fallback

When wrap returns `fallback: "agent-driven"`, you pick the source file yourself; the goal is unchanged: three preview variants now, and the accepted one persisted where the next build cannot wipe it.

1. **Find where the element really lives** from the error payload: `element_not_in_source` + `generatedMatch` means the served HTML is generated, so find the generator's template or partial; `element_not_found` means runtime-injected, so find the rendering component or data source; `file_is_generated` resolves the same way. A purely visual change may belong in a shared stylesheet rather than a template.
2. **Preview in the served file**: manually write the same wrapper scaffold `ui-design live-wrap` would emit (`<!-- impeccable-variants-start ID --><div data-impeccable-variants="ID" data-impeccable-variant-count="3" style="display: contents">…</div><!-- impeccable-variants-end ID -->`) into the file the browser actually loaded, insert your variant divs, `--reply EVENT_ID done --file <served file>`. This edit is temporary; a regen wiping it is fine.
3. **On accept, write to true source** (accept refuses generated files, so `_acceptResult.handled` is usually `false` here): structural change → template/component source; visual-only → the right stylesheet; content rendered from data → the data source or render logic. Then remove the temporary wrapper from the served file.
4. **On discard**, just remove the temporary wrapper.


## On `accept` events

Event: `{id, variantId, _acceptResult, _completionAck}`. The poll script already ran `ui-design live-accept` deterministically and acknowledged delivery; the browser DOM is already updated.

- The accept event includes `pageUrl`; the poll script must forward it to `ui-design live-accept --page-url PAGE_URL` so accept-time cleanup only scrubs staged copy edits for the current page.
- `_completionAck.ok !== true`: do not poll yet. Run `ui-design live-status` / `ui-design live-resume`, finish cleanup manually if needed, then `ui-design live-complete --id EVENT_ID`.
- `handled: true, carbonize: false`: nothing to do; poll again.
- `handled: true, carbonize: true`: required cleanup below; `_acceptResult.todo`, `_completionAck.requiresComplete`, and the stderr banner all point at it.
- `handled: false, mode: "fallback"`: the session lived in a generated file; you already wrote true source in fallback Step 3; clean the temporary wrapper and poll.
- `handled: false, mode: "error"`: **do not hand-edit the file.** `source_locked`: rerun the same `ui-design live-accept` command (idempotent) until the publisher releases. `accept_receipt_conflict`: the session already resolved as `priorOperation`; run `ui-design live-status` and tell the user. Anything else: report briefly, run `ui-design live-status` first.
- `handled: false` without `mode`: manual cleanup: read file, find markers, edit.

### Required after accept (carbonize)

`carbonize: true` means the accepted variant is merged into source with helper markers and inline CSS (so the browser renders with no gap). That merge-in is temporary; rewrite it into permanent form before anything else, or dead `@scope` rules, wrapper divs, and marker comments accumulate across sessions. Five steps, synchronously, before the next poll:

1. **Locate the carbonize block** in `_acceptResult.file`: bracketed by `<!-- impeccable-carbonize-start SESSION_ID -->` / `<!-- impeccable-carbonize-end SESSION_ID -->` with a `<style data-impeccable-css>` element; read the `<!-- impeccable-param-values -->` comment first when present, it drives steps 3 and 4.
2. **Move the CSS rules** into the project's real stylesheet (whichever already owns styling for the surrounding element).
3. **Bake param values while rewriting selectors**: retarget `@scope ([data-impeccable-variant="N"])` rules to real semantic classes; keep only the `:scope[data-p-<id>="VALUE"]` branch matching the chosen value; substitute `var(--p-<id>)` literals or update the var's default.
4. **Unwrap the accepted content**: delete the inner variant div (and on JSX the outer `data-impeccable-carbonize` div); drop `data-impeccable-params` and all `data-p-*` attributes.
5. **Delete** the inline `<style>` block, the param-values comment, both carbonize markers, and any `@scope` rules for non-accepted variants.

Then run `ui-design live-complete --id SESSION_ID` and verify `phase: "completed"` before polling again. The command is a gate, not a formality: it refuses with `error: "source_dirty"` plus findings while any live-mode leftover remains; fix and rerun (`--force` only for false positives).


## On `discard` events

Event: `{id, _acceptResult, _completionAck}`. The poll script already restored the original and acknowledged `discarded`. Nothing to do unless `_completionAck.ok !== true`; then `ui-design live-complete --id EVENT_ID --discarded` and poll again.

## On `steer` events

Event: `{id, message, pageUrl}`: page-level direction from the global bar's Steer control (typed or spoken), no element context, no variant cycling. Read `message`, inspect the page or files as needed, make edits or answer in prose. Reply `<skill-dir>/scripts/ui-design live-poll --reply EVENT_ID steer_done ["Optional short toast"]`, or on failure `--reply EVENT_ID error "Short reason"`, then poll immediately. No separate pickup reply; the Steer bar unlocks on `steer_done` or `error`.


## On `prefetch` events

Event: `{pageUrl}`: fired once per route on first selection; the user is likely about to Go on a page you have not read. Resolve the route to its file (root `/` is usually the boot's `pageFile`; multi-page sites often map `/foo` to `public/foo/index.html`; SPAs map everything to one entry), read it, poll again. No `--reply`. If you cannot resolve it confidently, skip and poll.

## Handle `manual_edit_apply`

Event: `{id, pageUrl, batch: {entries}, evidencePath?, chunk?, repair?, deadlineMs}`.

The user already clicked Apply. Do not ask what to do, discard, or redirect to Go. The parent live thread keeps the foreground poll loop and sends the final `/poll --reply --data`.

When subagents are available, delegate source edits to `exo-designer` using `reference/degraded/manual-edit-applier.md`. Pass cwd, scripts path, event id, page URL, chunk/deadline, `batch`, `evidencePath`, and the canonical JSON result schema. The delegate must not poll or reply. If unavailable, apply inline with the same contract.

If `repair` is present, the previous Apply changed source but final validation failed. Fix the current source and return the same canonical JSON result; do not roll files back yourself. The browser will ask the user before any rollback.

After source edits finish, reply exactly once with `<skill-dir>/scripts/ui-design live-poll --reply EVENT_ID done --data '{"status":"done","appliedEntryIds":["8hexid"],"failed":[],"files":["src/page.html"],"notes":[]}'`. Use `status:"partial"` or `status:"error"` with `failed[]` when not every entry applied. Then poll again. Never reply without the event id; `--reply done --file ...` is invalid for manual Apply.


## Exit

The user stops live mode by saying so in chat, closing the tab (SSE drops; poll returns `exit` after 8s), or the browser's exit button. On `exit`, kill any still-running background poll, then clean up.

## Cleanup

```bash
<skill-dir>/scripts/ui-design live-server stop
```

Stops the helper and runs `ui-design live-inject --remove` to strip the injected script (use `stop --keep-inject` to keep it for a quick restart; `.impeccable/live/config.json` persists as project config). Then search for and remove any leftover `impeccable-variants-start` wrappers and `impeccable-carbonize-start` blocks.

## Initial project setup

Only when `ui-design live` reports `config_missing` / `config_invalid`, or `configDrift` needs explaining, or the config lacks `cspChecked`: read [live-setup.md](live-setup.md). It owns the config schema, the per-framework `files` table, injection adapters, drift healing, and the CSP detection and consent flow.

```
