# Critique

Lock a single review target, execute **Track A** (judgment) and **Track B** (instrumentation) separately, merge into one UX report, archive optional snapshot, then ask next-step questions. **The in-chat write-up is the product**; disk archive feeds `/ui-design polish` and score trends.

## Non‑negotiables

- Track A and Track B are both required every run.
- Exposed Task/subagent tooling → launch A and B as **parallel isolated workers** (see exo-designer briefs below). Parent-thread execution is **degraded** unless no subagent tool exists (or the user declined where the harness asks)—banner: `⚠️ DEGRADED: single-context (<reason>)`.
- **Track A must finish before Track B influences synthesis.** Instrumentation output still anchors the merge even though it is deterministic.
- Omitting B fails the command unless the detect CLI is absent or crashed after a genuine attempt.
- Viewable targets require browser inspection when automation exists.
- Critique-only servers: `--background`, recorded stop method, stop before final report unless the user keeps them.
- Claim in-page overlays only after successful script injection **and** an in-tab detector pass.
- **Questions are last** in the message—full report first; nothing after questions.
- End with targeted questions **or** `Questions skipped: <reason>`.

## Setup

1. **Resolve target** to a concrete path or URL. Prefer source paths over dev URLs (ports drift).
   - “Homepage” → `index.html` / primary route file
   - “Settings modal” → owning component file
2. **Slug check** (skip archive if this fails—continue critique):

```bash
<skill-dir>/scripts/ui-design critique-storage slug "<resolved-path-or-url>"
```

Never hand-write slugs; later commands accept the resolved target and derive the same slug.

3. Read `.impeccable/critique/ignore.md` if present; drop matching findings silently.

## Orchestration

When subagents exist, launch Track A and Track B concurrently without shared context. Withhold findings from the user until the merged report.

Each track that uses the browser gets its **own new tab**.

**Degraded sequencing:** complete A, record notes, run B, merge, show banner. Report header must state:

- Dual workers: `Method: dual-agent (A: <id> · B: <id>)`
- Single context: `⚠️ DEGRADED: single-context (<reason>)`

### Track A — design review (exo-designer brief)

Spawn **exo-designer** with an isolated brief equivalent to:

- Read relevant source; inspect live UI when a browser is available.
- Judge **design specificity first** (product-grounded vs interchangeable?) **before** any detector data.
- Score holistic UX: hierarchy, IA, emotional fit, discoverability, composition, type/color, a11y, states, copy, edge cases.
- Run [Cognitive load checklist](#cognitive-load-checklist); flag decision points with **>4 visible options**.
- Note emotional journey (peak-end, valleys, high-stakes reassurance).
- Score [Nielsen heuristics](#heuristics-0-4) 0–4; use `n/a` where mode rules allow.
- Return: specificity verdict, heuristic table inputs, cognitive load notes, journey notes, a short **wins** list, a ranked **issues** list (with severities), persona walk notes, minor observations, provocative questions.

### Track B — detector + browser (exo-designer brief)

Spawn **exo-designer** with an isolated brief equivalent to:

**CLI scan:**

```bash
<skill-dir>/scripts/ui-design detect --json [markup-targets...]
```

- Markup paths/directories only—not CSS-only files.
- URLs → skip CLI; use browser path.
- Very large trees (hundreds of markup files) → shrink scope or ask the user.
- Process exit code 0 = clean; 2 = findings present.
- Missing detector → report unavailable; continue manual/browser review.

**Browser overlay (required for viewable targets when automation exists):**

1. Fresh tab; prefer harness browser tools over custom Playwright.
2. Preflight **mutable** injection (`document.title`, append `<script>`). Read-only evaluate does not count.
3. If mutation blocked → skip server/injection; report fallback signal.
4. If mutation OK:

```bash
<skill-dir>/scripts/ui-design live-server --background
```

Present browser if supported; label tab `[Human]`; scroll top; inject `http://localhost:PORT/detect.js`; wait 2–3s; read **detector console** messages; stop the live server.

5. Multi-page targets: inject on 3–5 representative URLs.

Return: CLI JSON summary, browser findings, false positives, skipped steps with reasons.

Parent reuses B’s CLI JSON—do not rerun detect unless B failed/truncated/omitted locations.

## Combined report (chat)

Weave A and B—do not concatenate. Note agreement, detector-only catches, and false positives.

### Section order

1. **Header provenance** (dual vs degraded)
2. **Design Health Score** — heuristic table (below)
3. **Design specificity verdict** — LLM + detector + overlay note
4. **Overall impression**
5. **What's working** — cite a few concrete wins
6. **Priority issues** — ranked list with P0–P3, fix, suggested `/ui-design` command
7. **Persona red flags** — chosen archetypes with element-level failures
8. **Minor observations**
9. **Questions to consider**

### Heuristic table template

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | System status visible | ? | |
| 2 | Matches user mental model | ? | |
| 3 | Freedom / undo paths | ? | |
| 4 | Internal + platform consistency | ? | |
| 5 | Prevents errors upstream | ? | |
| 6 | Recognition over recall | ? | |
| 7 | Expert accelerators | ? | |
| 8 | Minimal relevant UI | ? | |
| 9 | Recoverable errors | ? | |
| 10 | Task-focused help | ? | |
| **Total** | | **??/max** | **Band** |

`max = 4 × (scored heuristics)`. Renormalize when heuristics 7 and/or 10 are `n/a` on Persuade/Experience surfaces. Persist `max_score` and `na_heuristics` in archive meta. Honest scoring: most UIs land ~20–32 when all ten apply.

Suggested commands list: `/ui-design adapt|animate|audit|bolder|clarify|colorize|critique|delight|distill|document|harden|layout|onboard|optimize|overdrive|polish|quieter|shape|typeset`.

### Deliver before archive

Compose the full report in chat **before** any persistence heredoc. Archive-only reports count as a failed run.

## Persist snapshot

Skip when slug step failed.

1. Write report body (through questions section in archive copy—exclude later “Ask user / Recommended actions”) to a temp file.
2. Write with metadata:

```bash
IMPECCABLE_CRITIQUE_META='{"target":"<user phrasing>","total_score":<n>,"max_score":<n>,"na_heuristics":"<comma-separated or empty>","p0_count":<n>,"p1_count":<n>}' \
  <skill-dir>/scripts/ui-design critique-storage write "<resolved target>" <body-file>
```

`max_score` must match the table denominator. Local file targets also store a content fingerprint for polish. Leave written file on disk; polish closes it later.

3. Delete temp body; mention cleanup failure briefly if needed.
4. Trend:

```bash
<skill-dir>/scripts/ui-design critique-storage trend "<resolved target>" 5
```

5. Append one user-visible line before questions, e.g.:

> **Trend for `<slug>` (last 5 runs): 24 → 28 → 32 (out of 40)**
> Wrote `.impeccable/critique/<filename>`.

When denominators differ across runs, show each score with its own max and note incomparable sets. Missing older `max_score` → treat as 40. First run: say no trend yet.

Failures in archive must not block questions.

## Ask the user

Same message as report; report first, questions last. AskUserQuestion with **2–4** finding-specific questions (priority, tone intent, scope, optional off-limits). Required when **≥3 priority issues** unless `Questions skipped: <count>`.

## Recommended actions (after answers)

Ordered `/ui-design` commands reflecting user scope; map each priority issue; end with `/ui-design polish` when fixes planned. Invite one-at-a-time or batched rerun of `/ui-design critique`.

---

## Reference

### Cognitive load checklist

Eight checks:

1. **Single focus** — primary task without competing chrome
2. **Chunking** — ≤4 items per group
3. **Grouping** — related items visually grouped
4. **Visual hierarchy** — obvious primary element
5. **One decision at a time**
6. **Minimal choices** — ≤4 visible options per decision point
7. **Working memory** — no hidden prerequisites from prior screens
8. **Progressive disclosure** — complexity only when needed

Fail count: 0–1 low · 2–3 moderate · 4+ critical.

**Working memory rule:** ≤4 simultaneous items manageable; 5–7 borderline; 8+ overload.

Common failure modes: wall of options; memory bridges; hidden navigation; jargon barriers; flat visual weight; inconsistent patterns; multi-task demands; context switching across tabs/modals.

### Heuristics (0–4)

Score honestly; **4 = genuinely excellent**. Use `n/a` + one-line reason when a heuristic truly cannot apply (common: 7 and 10 on Persuade/Experience).

| # | Heuristic | What to verify |
|---|-----------|----------------|
| 1 | Visibility | Loading/save feedback, progress, location, inline validation |
| 2 | Real-world match | Plain language, logical order, familiar metaphors |
| 3 | Control | Undo/cancel/back, escape hatches |
| 4 | Consistency | Terminology, visuals, interaction parity |
| 5 | Error prevention | Confirm destructive actions, constraints, defaults |
| 6 | Recognition | Visible options, hints, labels on icons |
| 7 | Efficiency | Shortcuts, bulk actions (often `n/a` on marketing) |
| 8 | Minimalism | Only necessary information per step |
| 9 | Error recovery | Plain errors near source, preserved input |
| 10 | Help | Searchable/contextual help (often `n/a` on campaigns) |

**Rubric anchors (examples):**

- **Visibility 0** — no feedback; user guesses outcomes · **4** — every action confirms state
- **Consistency 0** — feels like unrelated products stitched · **4** — predictable cohesive system
- **Minimalism 0** — everything shouts equally · **4** — each pixel earns its place
- **Recovery 0** — cryptic codes · **4** — precise fix steps with data preserved

**Bands (all ten scored):** 36–40 excellent · 28–35 good · 20–27 acceptable · 12–19 poor · 0–11 critical. With `n/a`, use percentage bands (90/70/50/30 thresholds).

### Issue severity

| Tag | Meaning |
|-----|---------|
| **P0** | Blocks completion |
| **P1** | Major difficulty / serious a11y harm |
| **P2** | Annoyance with workaround |
| **P3** | Polish |

Support-contact test: if users would email support, ≥ P1.

### Persona archetypes

Pick **2–3** for the surface type; walk the primary action; list **specific** red flags (elements + interactions).

| Persona | Lens | Sample checks |
|---------|------|----------------|
| **Alex** (power) | Speed, shortcuts, skip onboarding | Keyboard path, batch actions, Esc on modals |
| **Jordan** (novice) | Clarity, labels, help | Obvious first action, no icon-only nav, plain errors |
| **Sam** (a11y) | Screen reader, keyboard, contrast | Focus visible, no color-only state, alt text |
| **Riley** (stress) | Edge cases, refresh mid-flow | Empty/long input, recovery, honest empty states |
| **Casey** (mobile) | Thumb reach, interruption | Bottom actions, 44×44 targets, state persistence |

| Surface type | Start with |
|--------------|------------|
| Landing / marketing | Jordan, Riley, Casey |
| Dashboard / admin | Alex, Sam |
| Checkout | Casey, Riley, Jordan |
| Onboarding | Jordan, Casey |
| Analytics | Alex, Sam |
| Wizard / forms | Jordan, Sam, Casey |

**Project personas:** when `CLAUDE.md` has `## Design Context` from init, add 1–2 audience-specific personas using the template (profile, behaviors, red flags)—only with real context, never invented audience.

---

## Failure handling & recovery

| Situation | Required behavior |
|-----------|-------------------|
| `critique-storage slug` non-zero | Skip archive + trend; still deliver full chat report + close |
| No Task/subagent tool (or user declined) | Sequential A→B; banner on line 1; header cites reason |
| `detect` missing or fails to load | State scan unavailable; B continues browser/manual; not a skip |
| B truncated / no counts / no rule names / no paths | Parent may rerun `detect` once; otherwise note gap in merge |
| Mutation preflight fails | No `live-server`; no overlay claim; report fallback signal |
| Injection succeeds but console empty | Treat as weak signal; do not promise highlights |
| `live-server --background` fails | Document port/bind error; manual static URL if user offers one |
| Multi-page partial injection | List which URLs ran; score viewable subset honestly |
| Archive `write` fails | One-line error; questions still mandatory |
| Temp body delete fails | Mention briefly; do not block user |
| Trend command fails | Omit trend line; archive path may still be valid |

**Stop live server** after overlay read (unless user asked to keep critique servers):

```bash
<skill-dir>/scripts/ui-design live-server stop
```

Record how it was started (`--background`) so stop is deterministic.

---

## Design specificity block (report §3)

Lead the narrative sections with product-grounded vs interchangeable judgment—**before** leaning on detector rows in prose.

- **Judgment lane:** coherence, sameness traps, category-default chrome, missed product character.
- **Scan lane:** counts, rule ids, paths; call out detector-only hits and confirmed false positives.
- **Overlay lane:** when injection worked, tell the user highlights live in the **`[Human]`** tab; summarize console lines. When injection failed, explicitly deny a reliable on-page overlay.

---

## Priority issue row template

Each ranked issue uses this skeleton (adapt voice, keep fields):

```
**[P?] Title** — one-line what broke
- **Impact:** who suffers and how (task blocked, trust lost, a11y harm)
- **Where:** file/line or visible control name
- **Fix:** concrete change (not “consider…”)
- **Command:** `/ui-design <verb>` from SKILL table
```

Tag **P0–P3** using the severity table above. Order by user harm, not file order.

---

## Emotional journey (Track A)

Map the primary flow as felt experience, not wireframes:

- **Peak-end:** what moment should stick; does the close reinforce it?
- **Valleys:** boredom, anxiety, confusion—where and why
- **High-stakes:** checkout, delete, publish, pay—reassurance present?
- **Tone fit:** does emotion match product promise from `PRODUCT.md`?

One short paragraph in the report is enough when the surface is trivial; deep flows get step labels.

---

## Extended heuristic anchors (0–4)

Use alongside the summary table; score the **worst** visible instance per heuristic.

| Heuristic | 0 (broken) | 2 (mixed) | 4 (excellent) |
|-----------|------------|-----------|---------------|
| Real-world match | Jargon gates every action | Mostly plain with odd terms | Language matches user mental model |
| Control | No undo on destructive | Some escapes missing | Predictable back/cancel everywhere |
| Error prevention | Destructive one-click | Weak confirms | Constraints + smart defaults |
| Recognition | Icon-only mystery meat | Some unlabeled controls | Options visible, icons labeled |
| Efficiency | No shortcuts on dense UI | Partial | Power paths without harming novices |
| Recovery | Data loss on error | Generic toast | Field-level errors, input kept |
| Help | None, or PDF manual | Generic FAQ link | Contextual, searchable |

Renormalize totals when 7 and/or 10 are `n/a`; never display `/40` on a partial denominator.

---

## Track B return contract (parent merge)

B must return structured bundles the parent can merge without rerun:

1. CLI: exit code, finding count, top rules with paths (or “skipped: URL-only”)
2. Browser: injection yes/no, port used, console excerpt or “none”
3. False positives: list with one-line rebuttal each
4. Skips: step name + reason (mutation blocked, tool missing, user URL only)

Parent **must not** paste raw JSON walls—summarize counts and exemplar paths in the Design Specificity / Priority sections.
