# Signals and reactive state

## Writable and derived

```ts
const count = signal(0);
count.set(3);
count.update((n) => n + 1);

const doubled = computed(() => count() * 2);
```

Services: private writable + public `asReadonly()`.

## Reactive contexts

Reads inside `computed`, `effect`, templates, and `linkedSignal` establish dependencies. Use `untracked(other)` when a read must not subscribe.

**Async rule:** read signals before `await`; post-await reads are not tracked.

## linkedSignal

Writable state reset from a source, with optional manual override.

```ts
selected = linkedSignal(() => this.options()[0]);

selected = linkedSignal({
  source: this.options,
  computation: (next, prev) =>
    next.find((o) => o.id === prev?.value.id) ?? next[0],
});
```

Use for user-overridable defaults — not `effect()` + `.set()`.

## resource (experimental)

Async loader tied to reactive `params`:

```ts
userRes = resource({
  params: () => ({ id: this.userId() }),
  loader: async ({ params, abortSignal }) => {
    const res = await fetch(`/api/users/${params.id}`, { signal: abortSignal });
    return res.json();
  },
});
```

Status: `value()`, `hasValue()`, `isLoading()`, `error()`, `status()`. Imperative refresh: `.reload()`. HTTP stack: prefer `httpResource` when using `HttpClient`.

## Effects

For imperative side effects (analytics, `localStorage`, canvas/chart libs). **Not** for mirroring state between signals.

Create in injection context (constructor/field init). Cleanup via `onCleanup` callback.

DOM after paint: `afterRenderEffect` with phased `earlyRead` / `write` / `read` — no DOM reads in `write`. Skips SSR.
