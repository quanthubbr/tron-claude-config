# Styling, motion, accessibility primitives

## Component styles

Inline `styles` / `styleUrl`. Encapsulation: `Emulated` (default), `ShadowDom`, `None`. Selectors: `:host`, `:host-context(.theme-dark)`. Avoid `::ng-deep`.

## Tailwind v4 (default for new setup)

```bash
ng add tailwindcss
```

Manual: install `tailwindcss`, `@tailwindcss/postcss`, `postcss`; `.postcssrc.json` with `@tailwindcss/postcss`; global `src/styles.css`:

```css
@import 'tailwindcss';
```

Do not default to v3 `@tailwind base/components/utilities` or a generated `tailwind.config.js` unless the repo already uses them.

## Motion

Check Angular version in `package.json`. **v20.2+:** prefer `animate.enter` / `animate.leave` with CSS keyframes; call `event.animationComplete()` when using custom `(animate.leave)` handlers.

Legacy `@angular/animations` DSL only when already entrenched — do not mix with native animate directives in one component. Bootstrap legacy: `provideAnimationsAsync()`.

Route transitions: browser View Transitions API via router `withViewTransitions()`.

## @angular/aria (headless)

Install when missing: `ng add` / package install for `@angular/aria`. Directives manage keyboard, ARIA, focus — **you supply markup and CSS**.

Style via `[aria-expanded]`, `[aria-selected]`, `[aria-pressed]`, `:focus-visible`. Patterns: accordion, listbox, combobox/select, menu/menubar, tabs, toolbar, tree, grid.

Rules:

- Use `ng*` directives instead of native `<select>` when implementing these patterns.
- Lazy panels: `ng-template` + `ngAccordionContent` / `ngTabContent`.
- Full product a11y audits: `ui-design` skill, not this file alone.

## Aria pattern quick map

| Pattern | Directives (import from `@angular/aria/...`) | Notes |
|---------|-----------------------------------------------|-------|
| Accordion | `ngAccordionGroup`, `ngAccordionTrigger`, `ngAccordionPanel`, `ngAccordionContent` | `[multiExpandable]`; lazy content in `ng-template` |
| Listbox | `ngListbox`, `ngOption` | Visible list; not a native `<select>` |
| Combobox / Select | `ngCombobox`, `ngComboboxInput`, `ngComboboxPopupContainer` + listbox | Autocomplete vs readonly select |
| Menu / Menubar | `ngMenuBar`, `ngMenu`, `ngMenuItem`, `ngMenuTrigger` | Actions, not form values |
| Tabs | `ngTabs`, `ngTabList`, `ngTab`, `ngTabPanel`, `ngTabContent` | ≤ ~7 tabs for usability |
| Toolbar | `ngToolbar`, `ngToolbarWidget`, `ngToolbarWidgetGroup` | `[multi]` groups for toggles |
| Tree | `ngTree`, `ngTreeItem`, `ngTreeGroup` | Expand via `[aria-expanded]` styling |
| Grid | `ngGrid`, `ngGridRow`, `ngGridCell`, `ngGridCellWidget` | Roving focus / selection |

Install package before first use. Agent supplies semantic HTML + CSS; directives manage focus and ARIA state.
