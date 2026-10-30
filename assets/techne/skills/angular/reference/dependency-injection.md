# Dependency injection

## Services

```ts
@Injectable({ providedIn: 'root' })
export class AuditLog {
  private http = inject(HttpClient);
  record(event: string) { /* … */ }
}
```

`providedIn: 'root'` → app singleton + tree-shaking when unused. Component-scoped: `@Component({ providers: [LocalState] })`.

## inject()

Valid in: field initializers and constructors of DI-created classes, functional guards/resolvers/interceptors, provider factories.

Invalid in ordinary methods — use `runInInjectionContext(injector, () => inject(Token))` or pass dependencies in.

Utilities: `assertInInjectionContext(fn)` for shared helpers.

## Providers

| Pattern | Use |
|---------|-----|
| `useClass` | Swap implementation |
| `useValue` | Config constants |
| `useFactory` | Dynamic construction (`inject()` inside factory) |
| `useExisting` | Alias token |
| `multi: true` | Interceptors, multi-plugins |

`InjectionToken<T>` for non-class values; can use `providedIn: 'root'` + factory.

Libraries: export `provideFeature(config): Provider[]`.

## Hierarchy

Resolution: walk **ElementInjector** up from host, then **EnvironmentInjector**. Modifiers: `optional`, `self`, `skipSelf`, `host`.

`providers` — visible to component, view, and projected content.  
`viewProviders` — component + view only (not projected content).

Route-level `providers` scope services to a feature branch.
