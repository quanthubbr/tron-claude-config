---
name: web
description: Cross-framework web UI architecture, Vite toolchain, Bun runtime, and SEO. Use for Vite config, env/proxy/HMR, Bun vs Node, component composition, forms, a11y basics, Core Web Vitals, and search metadata—not React- or Vue-specific APIs (see techne:react, techne:vue).
---

Stack-agnostic guidance for browser apps: how components compose, how Vite dev/build behaves, when Bun fits, and how to ship pages crawlers and users can trust. React and Vue specifics live in sibling skills; use **ui-design** for visual/a11y audits and **biblos** MCP for library API lookup.

## Non-negotiable rules

1. **Derive UI state during render** — never mirror props or computed values in `useEffect`/watchers unless syncing with external systems.
2. **Side effects belong in handlers or effects** — not in render bodies; clean up subscriptions, timers, and listeners.
3. **`vite build` does not type-check** — run `tsc --noEmit` or `vite-plugin-checker` in CI before release.
4. **Only `VITE_`-prefixed env vars are client-safe** — secrets stay server-side; never set `envPrefix: ''` or `loadEnv(..., '')`.
5. **Import modules directly** — avoid barrel `index.ts` re-exports that pull entire folders into dev and prod graphs.
6. **Smoke-test prod bundles** with `vite build && vite preview`; preview is not a production server.
7. **Fix crawl/index blockers before copy tweaks** — robots, canonicals, redirects, and CWV thresholds (LCP &lt; 2.5s, INP &lt; 200ms, CLS &lt; 0.1).
8. **One URL, one primary search intent** — unique titles (~50–60 chars) and honest meta descriptions (~120–160 chars).
9. **Structured data must match visible content** — no schema for content that is not on the page.
10. **Keyboard and semantics first** — native controls, labels, focus restore on dialogs; run **ui-design** `audit`/`harden` for WCAG depth.
11. **Commit Bun lockfile** (`bun.lock`) and use `bun install --frozen-lockfile` in CI/deploy when Bun is the package manager.
12. **Docker/dev containers**: Vite `server.host: true`; clear `node_modules/.vite` after dependency or branch changes if HMR acts stale.

## References

| File | Load when |
|------|-----------|
| [reference/frontend-patterns.md](reference/frontend-patterns.md) | Composition, hooks-shaped logic, forms, error boundaries, list virtualization, motion |
| [reference/vite-patterns.md](reference/vite-patterns.md) | `vite.config`, plugins, env, proxy, chunks, library mode, SSR externals, perf pitfalls |
| [reference/bun-runtime.md](reference/bun-runtime.md) | Choosing Bun vs Node, install/run/test, deploy, native APIs |
| [reference/seo.md](reference/seo.md) | Technical SEO audit, on-page, JSON-LD, keywords, internal links |
