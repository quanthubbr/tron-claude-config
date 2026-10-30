# Audit (web)

Execute measurable **implementation** checks; log findings for follow-up commands—do not patch in this pass. This is not a subjective design critique.

**Web surfaces only.** When `PRODUCT.md` platform is `ios`, `android`, or `adaptive`, switch to [audit.native.md](audit.native.md).

## Diagnostic scan (five dimensions, score each 0–4)

### 1 · Accessibility

**Look for:** contrast below 4.5:1 (7:1 if targeting AAA); `prefers-reduced-motion` without a real alternative (flag useless global 0.01ms kills); missing roles/labels/states; keyboard traps or missing focus; weak landmarks/heading order; div-as-button patterns; weak alt text; unlabeled inputs and vague errors.

**Rubric:** 0 = fails WCAG A · 1 = major gaps · 2 = partial effort · 3 = AA mostly met · 4 = AA solid, near AAA

### 2 · Performance

**Look for:** layout read/write thrash; animating expensive layout props; heavy blur/filter/shadow; images without lazy load; `will-change` left on at rest; bundle bloat; needless re-renders.

**Rubric:** 0 = severe · 1 = major · 2 = partial · 3 = good · 4 = excellent

### 3 · Theming

**Look for:** literal colors bypassing tokens; broken dark theme; mixed token families; values that fail to track theme switches.

**Rubric:** 0 = all literal · 1 = minimal tokens · 2 = inconsistent tokens · 3 = mostly tokenized · 4 = full system + dark

### 4 · Responsive layout

**Look for:** fixed widths breaking narrow viewports; touch targets under 44×44px; horizontal overflow; broken text scaling; missing breakpoints.

**Rubric:** 0 = desktop-only · 1 = many mobile failures · 2 = works with rough edges · 3 = good · 4 = fluid all targets

### 5 · Implementation integrity (critical)

Run `<skill-dir>/scripts/ui-design detect --json` on markup targets; verify each hit in context. Separate deterministic hits from judgment; note false positives. Watch for drift, decorative filler, interchangeable chrome.

**Rubric:** 0 = systemic drift · 1 = major repeats · 2 = several verified issues · 3 = minor · 4 = coherent

## Report shape

### Audit Health Score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | ? | |
| 2 | Performance | ? | |
| 3 | Theming | ? | |
| 4 | Responsive | ? | |
| 5 | Implementation integrity | ? | |
| **Total** | | **??/20** | **Band** |

**Bands:** 18–20 excellent · 14–17 good · 10–13 acceptable · 6–9 poor · 0–5 critical

### Opening verdict

**Implementation integrity first.** Pass/fail: does code express a product-specific system? Cite verified detector rows and code evidence.

### Executive summary

Score, P0–P3 counts, top 3–5 issues, suggested next commands.

### Detailed findings

Each row: **[P0–P3] title**, location (file/line), category, user impact, WCAG cite if any, fix steps, suggested `/ui-design` command from SKILL table.

### Patterns & positives

Recurring systemic issues; practices worth keeping.

## Recommended actions

Order by severity; map to `/ui-design adapt|animate|audit|bolder|clarify|colorize|critique|delight|distill|document|harden|layout|onboard|optimize|overdrive|polish|quieter|shape|typeset`. End with `/ui-design polish` when fixes are planned.

Tell the user they may run fixes one-by-one or batched, and re-run `/ui-design audit` after changes.

**Avoid:** impact-free laundry lists; unverified detector noise; all-P0 labeling; skipping positives.
