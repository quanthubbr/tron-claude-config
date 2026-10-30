---
paths:
  - "**/*.component.ts"
  - "**/*.component.html"
  - "**/*.service.ts"
  - "**/*.store.ts"
  - "**/*.routes.ts"
---
> Builds on the shared rules in `../common/patterns.md`.

# Angular patterns

## Layering

Route/smart components call services; services wrap `HttpClient` and domain rules. Dumb components only bind inputs/outputs.

## Async data

Prefer `resource()` for signal-first apps. Bridge legacy Observables with `toSignal`. Manual streams must use `takeUntilDestroyed()` — avoid manual `ngOnDestroy` unsubscribe subjects in new code.

## Routing

Lazy feature routes via `loadChildren`. Use `canMatch` to avoid downloading admin bundles for anonymous users. Resolvers prefetch data to reduce flicker.

Functional guards/resolvers with `inject()`:

```typescript
export const authGuard: CanActivateFn = () =>
  inject(AuthService).isAuthenticated() || inject(Router).createUrlTree(['/login']);
```

## HTTP

Register functional interceptors (`auth`, errors, retry) via `provideHttpClient(withInterceptors([...]))`. Never bypass interceptors with raw `fetch` unless documented.

## RxJS habits

`switchMap` for cancelable searches; `exhaustMap` for submit buttons; always `catchError` so streams do not die silently.

## Rendering modes

CSR default; add SSR/prerender via official schematics when SEO/TTFB require it. Guard `window`/`document` on server.

## Accessibility

Use Angular CDK headless patterns; style via attributes like `[aria-selected="true"]` instead of manual role juggling.

Reference **techne:angular** for forms, animations, and harness testing.
