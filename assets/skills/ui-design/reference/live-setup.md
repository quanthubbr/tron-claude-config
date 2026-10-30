# Live project setup (once)

Run this flow when `ui-design live` returns `config_missing`, `config_invalid`, drift you must explain, or missing `cspChecked`. Full session behavior stays in [live.md](live.md).

```setup-protocol
Create `.impeccable/live/config.json` at the boot `path` (default shown):

{
  "files": ["<path-or-glob>", ...],
  "exclude": ["<optional-glob>", ...],
  "insertBefore": "</body>",
  "commentSyntax": "html",
  "cspChecked": true
}

`files` lists HTML the browser loads (generated or source). Globs allowed. `exclude` skips subsets. `cspChecked` records CSP consent completed.

Hard excludes: `**/node_modules/**`, `**/.git/**`.

Glob: `**` any depth; `*` one segment; `?` one char; project-root relative paths.

Framework hints (detection + CSP—not always literal inject site):

| Stack | files | insertBefore | commentSyntax |
| SPA / Vite React / static | index.html | </body> | html |
| Next App Router | app/layout.tsx | </body> | jsx |
| Next Pages | pages/_document.tsx | </body> | jsx |
| Nuxt | app.vue | </body> | html |
| SvelteKit | src/app.html | </body> | html |
| TanStack Router SPA | index.html | </body> | html |
| TanStack Start SSR | src/routes/__root.tsx | <Scripts | jsx |
| Astro | root layout .astro | </body> | html |
| Multi-page static | public/**/*.html | </body> | html |

Prefer globs for multi-page. Generator rebuilds wipe inject until you re-run `ui-design live` (accept still writes true source via fallback).

Inject journal: `.impeccable/live/inject-journal.json`. SvelteKit/Nuxt/TanStack Start SSR shells need adapters from `<skill-dir>/scripts/ui-design live-inject` (dev-only roots/plugins). Plain Vite SPA uses default inject.

Drift scan on boot → `configDrift.orphans`; tell user once; never auto-edit config.

CSP (skip when cspChecked true):

<skill-dir>/scripts/ui-design detect-csp → { shape, signals }

null → write config + cspChecked true.
append-arrays / append-string → dev-only patch patterns (see live.md consent text).
middleware / meta-tag → user adds http://localhost:8400 to script-src and connect-src manually.

Consent block (verbatim tone):

> **CSP patch needed.** I detected a Content Security Policy in your project that blocks `http://localhost:8400`: the live picker won't load without an allowance. Here's the change I'd make:
> ```diff
> [file: <patchTarget>]
> [exact diff, 2-5 lines]
> ```
> It's guarded by `NODE_ENV === "development"` so the extra entry only appears in dev and never reaches production. You can remove it any time by reverting this file. Apply? [y/n]

append-arrays helper const (idempotent):

const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? ["http://localhost:8400"] : [];

Spread into script-src and connect-src arrays in the app CSP file (Next app config, SvelteKit kit.csp.directives, Nuxt nuxt-security headers, etc.).

append-string helper:

const __impeccableLiveDev =
  process.env.NODE_ENV === "development" ? " http://localhost:8400" : "";

Template into script-src and connect-src string CSP values (Next headers(), Nuxt routeRules, etc.).

If user declined CSP patch: delete cspChecked from config and re-run `ui-design live` to re-prompt.

After setup: re-run `ui-design live`.
```
