# Routing and rendering

## Configuration

```ts
export const routes: Routes = [
  { path: '', component: Home },
  { path: 'admin', canActivate: [authGuard], loadComponent: () => import('./admin/admin') },
  { path: '**', component: NotFound },
];

bootstrapApplication(App, { providers: [provideRouter(routes, withComponentInputBinding())] });
```

Order matters (first match). Params: `:id`. Redirects: `redirectTo`. Titles: `title` or `TitleStrategy`. Child routes need parent `<router-outlet />`.

Lazy: `loadComponent` / `loadChildren`. Loaders run in route injection context — `inject(FeatureFlags)` allowed.

## Navigation

Declarative: `RouterLink`, `routerLinkActive`. Programmatic: `Router.navigate([...], { queryParams, relativeTo })` or `navigateByUrl(string, { replaceUrl })`.

## Guards and resolvers

Functional guards return `boolean | UrlTree | Observable/Promise thereof`. Types: `canActivate`, `canActivateChild`, `canDeactivate`, `canMatch`.

```ts
export const authGuard: CanActivateFn = () =>
  inject(AuthService).isSignedIn() ? true : inject(Router).parseUrl('/login');
```

Resolvers (`ResolveFn`) prefetch before activation; failures block navigation — handle with `catchError` or global `withNavigationErrorHandler`. Resolved data: route `data` signal or `withComponentInputBinding()` → `input()`.

## Outlets

Primary `<router-outlet />`; named outlets `{ outlet: 'sidebar' }`. Events: `activate`, `deactivate`. Pass data: `[routerOutletData]` → `inject(ROUTER_OUTLET_DATA)`.

## Lifecycle events

Subscribe to `Router.events` — `NavigationStart`, `GuardsCheck*`, `Resolve*`, `NavigationEnd`, `NavigationCancel`, `NavigationError`. Debug: `withDebugTracing()`. View transitions: `withViewTransitions()` + global CSS on `::view-transition-old/new(root)`.

## Rendering modes

| Need | Mode |
|------|------|
| SEO + static | SSG / prerender |
| SEO + dynamic | SSR + hydration |
| Internal tools | CSR default |

Hydration: full vs incremental (`@defer`); event replay for early clicks.
