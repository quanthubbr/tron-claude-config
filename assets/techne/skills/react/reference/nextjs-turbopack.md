# Next.js dev bundler & routing files

Next.js 16+ uses **Turbopack** by default for `next dev`: incremental Rust bundler with filesystem cache under `.next` for faster restarts and HMR.

## Commands

```bash
next dev      # Turbopack default on 16+
next build
next start
```

## When to switch bundler

| Mode | Use |
|------|-----|
| Turbopack (default dev) | Daily development, large apps |
| Webpack dev | Turbopack bug or webpack-only plugin — pass `--webpack` or version-specific no-turbopack flag per **biblos** / current Next release notes |

Production bundler depends on Next version—confirm in docs for your pin.

## Practices

- Stay on supported 16.x for cache stability.
- If dev feels slow, confirm Turbopack is active and cache is not wiped each run.
- Bundle size: use version-appropriate analyzer (16.1+ experimental analyzer per docs).
- Prefer App Router + Server Components where they fit.

## Middleware filename (version-specific)

| Next version | Root file |
|--------------|-----------|
| 16+ | **`proxy.ts`** |
| &lt; 16 | `middleware.ts` |

This is a **framework version** rule, not a bundler choice. On Next 16+, **`proxy.ts` is correct**—do not rename to `middleware.ts` or edge logic will not run.

Confirm against official Next.js proxy/middleware docs for your exact release via **biblos** MCP.

## Related

App Router data patterns → **react-patterns** and **react-performance** references. Shared Vite/Bun/SEO → **techne:web**.
