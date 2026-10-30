Interfaces that only work with perfect demo data are not production-ready. Harden against real inputs, failures, locales, and networks.

## Assess needs

1. **Extreme inputs**
   - very long/short/empty text;
   - emoji, RTL, accents;
   - huge numbers; 1000+ list items; 50+ options;
   - empty datasets.

2. **Errors**
   - offline, slow, timeout;
   - API 400/401/403/404/500;
   - validation, permission, rate limit;
   - concurrent ops.

3. **i18n**
   - long translations (~30% over English);
   - RTL; CJK; emoji byte width;
   - date/number/currency formats.

**CRITICAL:** Design for messy reality, not the happy path.

## Dimensions

### Text overflow

```css
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.line-clamp {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.wrap {
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}
```

Flex/grid: `min-width: 0` (and `min-height: 0` on grid) so items can shrink.

Responsive type: `clamp()`; 16px body floor on mobile (14px only for truly secondary; iOS zooms focused inputs under 16px); test 200% zoom; containers grow with text.

### i18n

- Budget 30–40% extra space; flexible layouts; test German; avoid fixed text widths.

```jsx
// ❌ fixed width assumes short English
<button className="w-24">Submit</button>
// ✅ content-sized
<button className="px-4 py-2">Submit</button>
```

RTL: logical properties (`margin-inline-start`, `padding-inline`, `border-inline-end`) or `[dir="rtl"]` transforms.

UTF-8 everywhere; test CJK and emoji.

```javascript
new Intl.DateTimeFormat('de-DE').format(date);
new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
```

Pluralization via i18n library, not English-only string hacks.

### Errors

Network: clear message, retry, explain, offline mode if applicable.

Forms: inline errors, specific guidance, preserve input.

API: status-appropriate UX (400 validation, 401 login, 403 permission, 404 not found, 429 rate limit, 500 generic + support).

Graceful degradation: core path without JS where possible; alt text; progressive enhancement.

### Edge cases

Empty, loading (named operation, estimates), large data (pagination/virtual scroll), double-submit guards, race handling, optimistic rollback, permission states with explanation, browser feature detection + polyfills.

### Validation

Client hints + **always** server validate/sanitize; rate limits.

```html
<input maxlength="100" pattern="[A-Za-z0-9]+" required aria-describedby="username-hint" />
```

### a11y resilience

Keyboard-complete flows; focus in modals; skip links; ARIA and live regions; high-contrast testing; non-color cues.

### Performance resilience

Slow net: progressive images, skeletons, optimistic UI, service workers.

Cleanup listeners, subscriptions, timers; abort fetches on unmount.

```javascript
const debouncedSearch = debounce(handleSearch, 300);
const throttledScroll = throttle(handleScroll, 100);
```

## Testing

Manual: extremes, locales, offline, 3G throttle, screen reader, keyboard-only, old browsers.

Automated: unit edge cases, integration errors, E2E critical paths, visual regression, axe/WAVE.

**NEVER:** assume perfect input; ignore i18n; generic “Error occurred”; forget offline; client-only validation; fixed text widths; English-length assumptions; whole UI blocked on one component error.

## Verify

100+ char names, emoji fields, RTL, CJK, throttled net, 1000+ rows, rapid double-submit, forced API errors, empty data.

Then `/ui-design polish`.
