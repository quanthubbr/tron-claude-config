# HTML + Tailwind — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## Animation

- **Limit bounce animations** — Do: Use animate-bounce sparingly on CTAs only · Don't: Multiple bounce animations on page

## Z-Index

- **Fixed elements z-index** — Do: z-50 for nav z-40 for dropdowns · Don't: Relying on DOM order for stacking

## Images

- **Lazy loading** — Do: loading='lazy' on images · Don't: All images eager load
- **Responsive images** — Do: srcset and sizes attributes · Don't: Same large image all devices
- **SVG explicit dimensions** — Do: <svg class='size-6' width='24' height='24'> · Don't: SVG without explicit dimensions

## Forms

- **Focus states** — Do: focus:ring-2 focus:ring-blue-500 · Don't: Remove focus outline

## Responsive

- **Breakpoint testing** — Do: 320 375 768 1024 1280 1536 · Don't: Only test on development device

## Buttons

- **Touch targets** — Do: min-h-[44px] on mobile · Don't: Small buttons on mobile
- **Loading states** — Do: disabled + spinner icon · Don't: Clickable during loading
- **Icon buttons** — Do: aria-label on icon buttons · Don't: Icon button without label

## Accessibility

- **Screen reader text** — Do: sr-only for hidden labels · Don't: Missing context for icons
- **Reduced motion** — Do: motion-reduce:animate-none · Don't: Ignore motion preferences

## Performance

- **Configure content paths** — Do: Use 'content' array in config · Don't: Use deprecated 'purge' option (v2)
