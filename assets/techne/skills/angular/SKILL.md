---
name: angular
description: Angular application guidance — standalone components, signals, signal forms, DI, router, SSR/SSG, testing, CLI. Use when scaffolding or changing Angular apps, components, services, routes, forms, or build/test tooling.
---

Scope: ship and maintain Angular workspaces with version-aware defaults (signals-first, standalone components, modern control flow). Confirm the project's Angular version from `package.json` before recommending APIs. After codegen, run `ng build` and fix compile errors before stopping. For UI accessibility beyond ARIA primitives, use `ui-design` (`audit`, `harden`). For framework docs, use `biblos` MCP; for repo structure, use `atlas` MCP. Quality gates: `techne:quality` (tests), `exo-qa` / `security-review` / `exo-security` as needed.

## Non-negotiable rules

1. **CLI over hand-rolling structure** — `ng generate` for components, services, guards; `ng add` (not bare `npm install`) for Angular libraries so schematics update config.
2. **Standalone by default** — import dependencies in `@Component({ imports: [...] })`; match the repo if it still uses `NgModule`.
3. **Signals for new state** — prefer `signal` / `computed`; expose `asReadonly()` from services; never sync two signals with `effect()` — use `computed` or `linkedSignal`.
4. **Modern templates** — `@if`, `@for` (mandatory `track`), `@switch`; no `$parent` in nested `@for` — capture outer index with `let outerIdx = $index`.
5. **Signal I/O** — prefer `input()` / `output()` / `model()` over `@Input` / `@Output` / `EventEmitter`.
6. **Forms** — on supported versions, default new forms to signal forms (`@angular/forms/signals`); never seed fields with `null`/`undefined` (use `''`, `0`, `[]`); call fields before flags: `form.email().valid()` not `form.email.valid()`.
7. **DI** — use `inject()` in injection contexts only; elsewhere `runInInjectionContext`; services as `@Injectable({ providedIn: 'root' })` unless a scoped instance is required.
8. **Routing** — functional guards/resolvers; lazy-load feature areas; client guards are not authorization — enforce on the server.
9. **Change detection** — prefer `ChangeDetectionStrategy.OnPush`; read signals before `await` inside reactive contexts.
10. **Styling** — Tailwind v4 via `@import 'tailwindcss'` and PostCSS plugin; do not add legacy v3 `@tailwind` layers or default `tailwind.config.js` unless the project already uses them.
11. **Testing** — Act → `await fixture.whenStable()` → assert; router tests via `RouterTestingHarness`, not mocked `Router`; prefer harness APIs over brittle DOM selectors.
12. **Project creation** — explicit version → `npx @angular/cli@<ver> new …`; else `ng version` success → `ng new …`; else `npx @angular/cli@latest new …`.

## References

| File | Load when |
|------|-----------|
| [reference/components-and-templates.md](reference/components-and-templates.md) | Components, control flow, inputs/outputs, host bindings |
| [reference/signals-and-state.md](reference/signals-and-state.md) | Signals, `linkedSignal`, `resource`, effects, async reactivity |
| [reference/forms.md](reference/forms.md) | Signal, reactive, or template-driven forms |
| [reference/dependency-injection.md](reference/dependency-injection.md) | Services, providers, injectors, tokens |
| [reference/routing.md](reference/routing.md) | Routes, guards, resolvers, outlets, SSR/rendering |
| [reference/styling-motion-a11y.md](reference/styling-motion-a11y.md) | CSS encapsulation, Tailwind, motion, `@angular/aria` |
| [reference/testing.md](reference/testing.md) | Unit, harness, router, E2E |
| [reference/tooling.md](reference/tooling.md) | CLI workflows, proxy, Angular CLI MCP server |
