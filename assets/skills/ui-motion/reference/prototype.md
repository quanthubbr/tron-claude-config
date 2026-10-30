# UI prototypes with variant picker

Build **genuinely different** implementations of one UI piece behind fixed harness chrome so the user compares live and promotes a winner. Not for reviewing shipping code (`reference/review.md`) or dependency choice (`reference/ui-libraries.md`).

## Posture

Divergence is the product — three accent tweaks teach nothing. Each variant must be shippable-quality motion: ease-out entrances, sub-300ms UI, correct origins, transform/opacity, reduced motion. Sloppy variants waste the picker.

## Hard rules

1. **No production edits** until user picks winner (Phase 6).
2. Variants differ on a **named axis** (layout, density, personality, motion model) — shared tokens OK.
3. Each variant **works** — real interactions, plausible copy, no lorem/dead controls.
4. Picker chrome is **spec-fixed** below — not themed to the product.
5. After promote, remove prototype surface unless user keeps it.

## Workflow

### 1 — Scope

One component per run. Multi-piece briefs → pick highest leverage, offer follow-ups. Restate brief in one sentence.

### 2 — Recon

Stack, styling, motion libs, design tokens, personality, surrounding context. No project → neutral standalone defaults.

### 3 — Directions

Default **3** variants (max **5**). Name + axis before code; no "Option A". Replace duplicates that differ only in color.

### 4 — Harness

- **With dev server:** isolated route `/prototypes/<slug>`, one file per variant + harness — no imports into production.
- **Static:** single HTML file, inline assets.

Embed picker spec from **Picker spec** section. Show **one variant full-size** in realistic context (toast needs page behind it). **Variant switch is instant** — high-frequency action, no transition.

### 5 — Verify & hand off

Run all variants; clean console; screenshot if possible. Present table and **stop for user choice**:

| # | Variant | Axis | When to pick it | Cost |
| --- | --- | --- | --- | --- |

Share URL/path and keyboard hints.

### 6 — Promote

Integrate winner into production conventions; delete prototype dir unless `keep … leave the picker`.

### Invocation

| Input | Behavior |
| --- | --- |
| description | Full flow, 3 variants |
| description xN | N variants (≤5) |
| riff &lt;name&gt; | New set around that direction |
| keep &lt;name&gt; | Promote + cleanup |
| keep &lt;name&gt;, leave the picker | Promote, keep harness |

---

## Picker spec (harness chrome — fixed)

Dark glass pill, bottom-center (or `data-position="top"` if variant occupies bottom-center). Not brand-themed.

### Markup

```html
<nav class="variant-rail" aria-label="Prototype variants">
  <span class="variant-rail-thumb" aria-hidden="true"></span>
  <button class="variant-rail-btn" data-active aria-current="true">Quiet</button>
  <button class="variant-rail-btn">Bold</button>
  <button class="variant-rail-btn">Playful</button>
  <span class="variant-rail-sep" aria-hidden="true"></span>
  <button class="variant-rail-btn variant-rail-replay" aria-label="Replay animation (R)">↻</button>
</nav>
```

Framework: keep class names and structure.

### Styles

```css
.variant-rail {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2147483647;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 999px;
  background: rgba(10, 10, 10, 0.82);
  -webkit-backdrop-filter: blur(12px) saturate(1.4);
  backdrop-filter: blur(12px) saturate(1.4);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 8px 24px rgba(0, 0, 0, 0.24),
    0 2px 6px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1;
  -webkit-font-smoothing: antialiased;
  user-select: none;
}

.variant-rail-thumb {
  position: absolute;
  top: 4px;
  left: 0;
  height: 28px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  will-change: transform;
}

.variant-rail[data-ready] .variant-rail-thumb {
  transition:
    transform 250ms cubic-bezier(0.23, 1, 0.32, 1),
    width 250ms cubic-bezier(0.23, 1, 0.32, 1);
}

@media (prefers-reduced-motion: reduce) {
  .variant-rail[data-ready] .variant-rail-thumb { transition: none; }
}

.variant-rail-btn {
  position: relative;
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.55);
  font: inherit;
  cursor: pointer;
  transition: color 150ms ease-out;
}

.variant-rail-btn:hover { color: rgba(255, 255, 255, 0.85); }
.variant-rail-btn:active { transform: scale(0.97); }
.variant-rail-btn:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.4);
  outline-offset: 2px;
}
.variant-rail-btn[data-active] { color: #fff; }

.variant-rail-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: rgba(255, 255, 255, 0.12);
}

.variant-rail-replay { padding: 0 10px; font-size: 14px; }

.variant-rail[data-position="top"] {
  bottom: auto;
  top: 24px;
}
```

Thumb slides (250ms strong ease-out); **preview swap stays instant**. Width transition on thumb is allowed — no layout dependents.

Replay control only if a variant has replay-worthy entrance motion.

### Behavior

- Keys `1–N`, arrows, `R` replay; ignore when focus in input/textarea/select/contenteditable or modifiers held.
- Click sets `data-active` + `aria-current="true"`; thumb follows.
- Persist `?v=` in URL; `data-ready` after first paint so load does not animate thumb.
- Switch remounts variant (entrances replay); `R` remounts current.

### Reference wiring (vanilla)

```js
const canvas = document.getElementById('stage');
const rail = document.querySelector('.variant-rail');
const thumb = rail.querySelector('.variant-rail-thumb');
const tabs = [...rail.querySelectorAll('.variant-rail-btn:not(.variant-rail-replay)')];
const replayBtn = rail.querySelector('.variant-rail-replay');
let idx = 0;

function syncThumb() {
  const tab = tabs[idx];
  thumb.style.width = `${tab.offsetWidth}px`;
  thumb.style.transform = `translateX(${tab.offsetLeft}px)`;
}

function renderVariant(i) {
  canvas.replaceChildren();
  requestAnimationFrame(() => {
    const root = renderers[i]();
    canvas.append(root);
  });
}

function selectVariant(i) {
  if (i < 0 || i >= renderers.length) return;
  idx = i;
  tabs.forEach((el, j) => {
    const on = j === i;
    el.toggleAttribute('data-active', on);
    el.setAttribute('aria-current', on ? 'true' : 'false');
  });
  syncThumb();
  const loc = new URL(location.href);
  loc.searchParams.set('v', String(i + 1));
  history.replaceState(null, '', loc);
  renderVariant(i);
}

tabs.forEach((el, i) => el.addEventListener('click', () => selectVariant(i)));
replayBtn?.addEventListener('click', () => renderVariant(idx));
window.addEventListener('resize', syncThumb);

document.addEventListener('keydown', (ev) => {
  const tag = ev.target.tagName;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || ev.target.isContentEditable) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const n = parseInt(ev.key, 10);
  if (n >= 1 && n <= renderers.length) selectVariant(n - 1);
  else if (ev.key === 'ArrowRight') selectVariant((idx + 1) % renderers.length);
  else if (ev.key === 'ArrowLeft') selectVariant((idx - 1 + renderers.length) % renderers.length);
  else if (ev.key === 'r' || ev.key === 'R') renderVariant(idx);
});

const fromUrl = parseInt(new URLSearchParams(location.search).get('v'), 10) || 1;
selectVariant(fromUrl - 1);
requestAnimationFrame(() => requestAnimationFrame(() => rail.setAttribute('data-ready', '')));
```

`renderers` = array of functions returning DOM nodes for each variant.
