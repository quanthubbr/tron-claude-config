# Review, audit & improve motion

Single procedure for: **diff review** (block/approve), **codebase audit** (read-only findings), and **planning fixes** (self-contained plans for executors). Does not apply patches — executors use `exo-frontend` / `exo-mobile` or user-directed agents.

---

## Part A — Review a diff

Specialized motion review only. Default **flag**; approval is earned.

### Ten standards (violations = findings)

1. **Justified motion** — purpose from allowed set; not "looks cool" on frequent UI.
2. **Frequency fit** — 100+/day and keyboard → no animation; tiers per `SKILL.md`.
3. **Responsive easing** — enter/exit ease-out or strong custom; **no ease-in** on UI.
4. **Sub-300ms UI** — unless justified (drawer/marketing tiers).
5. **Origin & physicality** — trigger-anchored origin; no `scale(0)`; modals centered OK.
6. **Interruptibility** — transitions/springs for rapid/gesture UI; not keyframes that restart.
7. **GPU props** — transform/opacity; no layout props; Motion shorthands under load → full transform string.
8. **Accessibility** — reduced motion (gentler, not zero); hover behind `(hover: hover) and (pointer: fine)`.
9. **Asymmetric timing** — slow deliberate user phase, fast system response.
10. **Cohesion** — motion matches product personality; blur(2px) seam optional on bad crossfades.

### Escalate immediately

`transition: all`; `scale(0)`; ease-in on UI; animation on keyboard/high-frequency; UI &gt;300ms unjustified; center origin on anchored popover; keyframes on toasts/toggles; layout animation; Motion x/y on busy pages; parent CSS var driving child transform; missing reduced-motion or hover gate; symmetric press/release on hold flows; group entrance without 30–80ms stagger.

### Fix preference order

1. Delete animation → 2. Reduce → 3. Fix easing → 4. Fix origin/physicality → 5. Interruptible mechanism → 6. GPU path → 7. Asymmetric timing → 8. Polish (stagger, blur, `@starting-style`, spring) → 9. A11y & cohesion.

### Required output

**Table** (not Before/After lists):

| Before | After | Why |
| --- | --- | --- |

**Verdict tiers:** feel-breaking → simplifications → performance → interruptibility → origin/cohesion → a11y.

Close with **Block** (any feel-breaking, keyboard motion, scale(0), ease-in, easy GPU fix missed) or **Approve**.

Cite `file:line`. Values from reference tables below — never approximate.

---

## Part B — Audit playbook (eight categories)

Use for full-repo or focused audits. Same value tables as review.

### 1. Purpose & frequency

Hunt keyboard/palette animation, decorative list/hover on constant paths. Strongest fix: delete.

### 2. Easing & duration

Decision order: enter/exit → ease-out; on-screen move → ease-in-out; hover/color → ease; constant → linear.

Tokens:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Duration budgets: press 100–160; tooltip 125–200; dropdown 150–250; modal/drawer 200–500; marketing longer. UI &lt;300ms. Toolbar tooltips after first should skip delay/animation.

### 3. Physicality & origin

No `scale(0)` — use 0.9–0.97 + opacity. Popovers: `transform-origin: var(--transform-origin)`. Press: scale(0.97), 160ms ease-out.

### 4. Interruptibility

Transitions vs keyframes; `@starting-style` or mount flag; springs for gestures `{ type: "spring", duration: 0.5, bounce: 0.2 }` bounce 0.1–0.3; velocity dismiss &gt; ~0.11; rubber-band not wall; asymmetric hold/release.

### 5. Performance

transform/opacity; no `transition: all`; no parent `--var` driving child transform; Motion → transform string; CSS/WAAPI for predetermined under load; blur &lt;20px.

### 6. Accessibility

Reduced motion + hover gating (snippets in `SKILL.md`).

### 7. Cohesion & tokens

Personality match; consolidate duplicate beziers; stagger 30–80ms; crossfade blur mask.

### 8. Missed opportunities

Teleport states, missing trigger spatial story, rare delight flat — handful only, evidence-based.

---

## Part C — Improve workflow (audit → plans)

Read-only on product source. Output lives under `plans/` or `animation-plans/`.

### Phase 1 — Recon

Stack, motion libs, token locations, personality, frequency map. Grep: `transition`, `@keyframes`, `motion.`, `ease-in`, `transition: all`, `scale(0)`, `prefers-reduced-motion`, `transform-origin`.

### Phase 2 — Audit

Run Part B categories. Large repos: parallel read-only passes per category with recon facts embedded. Effort levels:

| Mode | Scope | Findings |
| --- | --- | --- |
| quick | Hot paths | ~5 HIGH only |
| standard | All interactive UI | Full table |
| deep | Whole repo + marketing | Full + LOW polish |

### Phase 3 — Vet & prioritize

Confirm every finding at `file:line`. Drop by-design (modal center origin, marketing duration). Table:

| # | Impact | Theme | Where | Issue | Remedy (one line) |

Impact: **HIGH** breaks feel; **MEDIUM** users notice; **LOW** polish. List 2–4 additive opportunity rows apart from fixes. **Wait for user** to pick plan targets unless batch mode → top 3–5 by leverage.

### Phase 4 — Plans

One markdown plan per selected finding in `plans/NNN-slug.md`. Plans must be executor-proof:

- Full paths and current code excerpt
- Exact target bezier, ms, spring config inline
- Ordered steps, scope boundaries
- Verification + feel-check (slow motion, frame step, real device for gestures)
- Stamp `git rev-parse --short HEAD` when writing

Update `plans/README.md` with order, dependencies, status.

### Invocation variants

| Call | Behavior |
| --- | --- |
| default | Full recon → audit → vet → wait → plans |
| quick / deep | Adjust coverage |
| category focus | Single category audit |
| plan &lt;description&gt; | Skip audit; one plan after minimal recon |
| execute &lt;plan&gt; | Executor implements; re-review diff at Part A bar |
| reconcile | Refresh plan status vs current code |

Respect documented intentional tradeoffs in code/docs — note, do not reopen.

---

## Reference values (cite in findings)

**Springs (web Motion):**

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

**Gesture dismiss:** `velocity = Math.abs(distance) / elapsedMs`; dismiss if &gt; ~0.11 or past distance threshold.

**Stagger:** 30–80ms; decorative only.

**Debugging when uncertain:** 2–5× duration, DevTools animation panel, physical device for gestures, revisit next day.

**Cohesion note:** Component personality sets curve choice — crisp dashboard vs playful consumer; toast libraries may use slightly slower `ease` for elegance if whole system matches.
