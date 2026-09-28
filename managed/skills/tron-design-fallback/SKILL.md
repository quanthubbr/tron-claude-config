---
name: tron-design-fallback
description: SUBORDINATE to the Emil + Impeccable + Taste design combo. Consult only after the combo has set design direction, and only for four gaps it does not cover - charts and data visualization, form UX patterns, web navigation patterns, and stack implementation guidelines (Vue, Nuxt, React, Next.js, React Native, shadcn/ui, HTML + Tailwind). Never sets visual direction, style, palette, typography or motion.
---

# tron-design-fallback

Authority: this skill never sets visual direction. Emil Kowalski, Impeccable and Taste are the maximum source of truth for design; on any conflict between this file and the combo, the combo wins. Consult it only after the combo has defined direction, and only for the four areas below: charts, forms, web navigation and stack guidelines. Existing project design systems still win for tokens and components.

Not here on purpose (the combo owns it): aesthetic direction, style and palette selection, typography and font pairing, motion and animation, responsive and native iOS/Android adaptation, performance and Core Web Vitals, accessibility audit and hardening, i18n, empty and error states, copywriting, polish.

## 1. Charts and data visualization

Pick the chart from the data shape, not from looks.

| Data type | Best chart | Avoid when | A11y fallback |
|-----------|-----------|-----------|---------------|
| Trend over time | Line | Fewer than 4 points (use a stat card); more than 6 series; no time dimension | Dashed/dotted line per series; toggleable data table with timestamps |
| Compare categories | Bar (horizontal for long labels) | More than 15 categories (use a table); data has a time axis (use line) | Value labels always visible |
| Part-to-whole | Donut / pie | More than 5 slices; differences under 5%; precise values needed | Stacked bar + percentage table (mandatory) |
| Correlation / distribution | Scatter / bubble; box plot for groups | Categorical variables; fewer than 20 points; mobile-primary | Shape marker per group; data table (or min/Q1/median/Q3/max table) |
| Heatmap / intensity | Heat map | Fewer than 20 cells (use bar); exact values needed; no pattern fallback for colorblind users | Numeric overlay on hover/focus; grid table with row/column labels |
| Funnel / flow | Funnel; Sankey for branching | Non-sequential stages; values not monotonically decreasing; fewer than 3 stages | List of stage + count + drop-off %; keyboard traversal |
| Performance vs target | Bullet (grid for several KPIs); gauge for a single KPI | No target or benchmark exists | Value and % of target as visible text; live region for real-time updates |
| Hierarchical | Treemap | More than 3 levels; precise sibling comparison needed | Collapsible tree table as primary view |
| Real-time streaming | Streaming area / line | Updates less than once a minute (use periodic refresh) | Pause/resume control; current value as large text; freeze under reduced motion |
| Geographic | Choropleth / bubble map | Region sizes distort comparison (use bar); mobile-primary | Region labels; sortable table by region; keyboard-navigable regions |

Rules:

- Never encode meaning by color alone: add pattern, shape, line style or direct labels; no red/green-only pairs.
- Contrast: data marks vs background at least 3:1; data text labels at least 4.5:1.
- Always show a legend next to the chart; make it toggle series when there are several.
- Label axes with units and readable, auto-skipped ticks; label time granularity and allow switching when relevant.
- Direct-label values on small datasets; exact values via tooltip on hover, tap and keyboard focus.
- Interactive marks (points, bars, slices) are keyboard-focusable and have at least 44pt touch targets.
- Provide a data table alternative (sortable, with `aria-sort`) and a text summary or `aria-label` stating the key insight.
- Format numbers, dates and currency with the user's locale.
- More than 5 categories on a pie becomes a bar; 1000+ points get aggregated or sampled with drill-down.
- Drill-down keeps a visible back path (breadcrumb of the current level).
- One question per chart; split dense charts; keep gridlines low-contrast and skip decorative gradients and shadows.
- Charts reflow on small screens (horizontal bars, fewer ticks) and render readable data immediately; entrance animation respects reduced motion.
- Every chart has loading (skeleton, not an empty axis frame), empty (message + next step) and error (message + retry) states.
- Data-heavy products offer CSV export of the underlying data.

## 2. Forms and feedback

Complements Impeccable `harden` (validation, sanitization, double-submit, permission states); use both.

- Every input has a visible label; placeholder is never the only label. Group related fields with `fieldset`/`legend`.
- Mark required fields visibly and with `required` / `aria-required`.
- Use semantic input types (`email`, `tel`, `number`, `url`) and `autocomplete` tokens so keyboards and autofill work.
- Password fields have a show/hide toggle.
- Validate on blur, not on every keystroke; show the error directly below its field, stating cause and fix.
- Errors are announced: `aria-live` region or `role="alert"`, and the field links to its message via `aria-describedby`.
- After a failed submit, move focus to the first invalid field. With many errors, add an error summary at the top whose items anchor to each field.
- Submit shows loading, then success or error; the button stays disabled only while the request is in flight.
- Toasts never steal focus: announce them with `aria-live="polite"`.
- Confirm destructive actions and dismissing a modal/sheet with unsaved changes.
- Offer undo for destructive and bulk actions (for example an "Undo delete" toast) instead of, or in addition to, a confirm.
- Multi-step flows show a step indicator and allow going back without losing entered data.
- Read-only is not disabled: read-only stays focusable, selectable and readable; disabled is removed from interaction and carries the semantic attribute.

## 3. Web navigation patterns

Native navigation (tab bars, app bars, gestures) belongs to Impeccable `adapt`, `ios` and `android`.

- Highlight the current location in every nav (indicator plus weight or color) and set `aria-current="page"`.
- Back is predictable: restore scroll position, filters and form input; never silently reset the stack or jump home.
- Key screens and meaningful state (filters, tabs, pagination, selected item) live in the URL so they are deep-linkable and shareable.
- On client-side route change, move focus to the main content region (or its heading) and update the document title.
- Use breadcrumbs for hierarchies 3+ levels deep.
- Do not mix tabs, sidebar and bottom nav at the same hierarchy level; keep nav placement identical across pages.
- Modals are not for primary navigation flows; if it needs a URL or a back button, it is a page.
- Keep destructive actions (delete account, logout) visually and spatially separated from normal nav items.
- When a destination is unavailable, show it disabled with the reason instead of silently hiding it.
- Adaptive nav: persistent sidebar at 1024px and wider; top bar or bottom nav on small screens; core nav stays reachable from deep pages.

## 4. Stack implementation guidelines

High-severity implementation rules only (correctness, not look). Detect the stack from the project's `package.json` dependencies and read the matching file; read every file that applies (for example Nuxt + Tailwind).

| Stack | Detect in `package.json` | Reference |
|-------|--------------------------|-----------|
| Vue | `vue` (without `nuxt`) | `references/stacks/vue.md` |
| Nuxt / Nuxt UI | `nuxt`, `@nuxt/ui` | `references/stacks/nuxt.md` (also `vue.md`) |
| React | `react` (without `next` / `react-native`) | `references/stacks/react.md` |
| Next.js | `next` | `references/stacks/nextjs.md` (also `react.md`) |
| React Native | `react-native`, `expo` | `references/stacks/react-native.md` |
| shadcn/ui | `components.json` at the root, `@radix-ui/*` + `class-variance-authority` | `references/stacks/shadcn.md` |
| HTML + Tailwind | `tailwindcss`, `@tailwindcss/*` | `references/stacks/html-tailwind.md` |

## 5. Pre-delivery add-on

Run after the combo's own polish/audit pass; these are the items it does not enforce.

- [ ] Clickable elements that are not `<button>`/`<a>` have `cursor: pointer` (and a proper role plus keyboard handler).
- [ ] Every chart has a visible legend, a non-color encoding, and a table or text-summary fallback.
- [ ] Forms: visible labels, error below field, errors announced, focus moves to the first invalid field on submit.
- [ ] Toasts use `aria-live="polite"` and never take focus.
- [ ] Client-side route changes move focus to main content and update the title; the active nav item is marked.
- [ ] Meaningful UI state (filters, tabs, pagination) survives reload and back via the URL.
- [ ] `z-index` values come from a defined scale (tokens), not ad-hoc numbers.

Derived from [ui-ux-pro-max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT).
