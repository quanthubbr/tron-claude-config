Performance is a feature. Find **this** interface’s bottleneck, fix it, measure—don’t tune what isn’t slow.

## Assess

1. **Measure now**
   - Core Web Vitals: LCP, INP, CLS
   - Load: TTI, FCP
   - Bundle: JS, CSS, images
   - Runtime: FPS, memory, CPU
   - Network: request count, payloads, waterfall

2. **Bottlenecks**
   - What’s slow (load, interaction, animation)?
   - Cause (images, JS, layout thrash)?
   - Severity and who’s affected?

**CRITICAL:** Before/after metrics. Optimize what matters.

## Strategy

### Loading

**Images:** WebP/AVIF; right dimensions; lazy below fold; `srcset`/`picture`; ~80–85% quality; CDN.

```html
<img src="hero.webp" srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
  sizes="(max-width: 400px) 400px, (max-width: 800px) 800px, 1200px" loading="lazy" alt="Hero" />
```

**JS:** code split; tree-shake; drop unused deps; dynamic import heavy pieces.

```javascript
const HeavyChart = lazy(() => import('./HeavyChart'));
```

**CSS:** purge unused; critical inline; contain independent regions.

**Fonts:** `font-display: swap|optional`; subset; preload critical; system fonts when OK; limit weights.

```css
@font-face {
  font-family: 'CustomFont';
  src: url('/fonts/custom.woff2') format('woff2');
  font-display: swap;
  unicode-range: U+0020-007F;
}
```

**Loading order:** critical first; async/defer rest; preload; prefetch next routes; service worker; HTTP/2+.

### Rendering

Batch DOM reads then writes—avoid layout thrash.

Use `contain`; flatter/shallower DOM; `content-visibility: auto`; virtual lists for huge sets.

Prefer `transform`/`opacity` for motion; avoid animating layout drivers; sparse `will-change`; isolate expensive paint.

### Animation

60fps (~16ms/frame); `requestAnimationFrame`; debounce/throttle scroll; CSS when possible.

Intersection Observer for lazy animate/load.

### Frameworks

React: `memo`, `useMemo`/`useCallback`, virtualize, split routes, avoid inline fns in hot render—profile.

Generally: fewer re-renders; debounce expensive work; memoize; lazy routes/components.

### Network

Fewer requests; sprite SVG icons; inline tiny critical assets; drop dead third parties.

APIs: pagination; GraphQL selective fields; gzip/brotli; cache headers; CDN.

Slow nets: adaptive loading (`navigator.connection`); optimistic UI; prioritization.

## Core Web Vitals

- **LCP < 2.5s:** hero images, critical CSS, preload, CDN, SSR
- **INP < 200ms:** break long tasks; defer JS; workers; less main-thread JS
- **CLS < 0.1:** image/video dimensions; no inject-above-content; `aspect-ratio`; reserve ad/embed space

```css
.image-container { aspect-ratio: 16 / 9; }
```

## Monitoring

Lighthouse, WebPageTest, CrUX, bundle analyzers, RUM (Sentry, Datadog, etc.). Track LCP, INP, CLS, TTI, FCP, TBT, bundle size, request count.

Test real devices and slow networks—not desktop Chrome alone.

**NEVER:** optimize blind; sacrifice a11y; break features; blanket `will-change`; lazy-load above fold; micro-opts before big wins; ignore mobile.

## Verify

Before/after Lighthouse; RUM trends; low-end Android; 3G throttle; no regressions; feels faster.

Then `/ui-design polish`.
