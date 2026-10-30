---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/hooks/**/*.ts"
  - "**/hooks/**/*.js"
  - "**/use-*.ts"
  - "**/use-*.tsx"
---
> React hook APIs (not harness hooks). Extends [typescript/patterns.md](../typescript/patterns.md).

# React hooks rules

Enable `eslint-plugin-react-hooks` (`rules-of-hooks`: error).

## Placement

Hooks only at component/hook top level — never inside conditions, loops, nested functions, or after early returns.

## Effects

Use `useEffect` to sync with externals (subscriptions, DOM APIs, non-React libraries). Do **not** use effects to:

- mirror props/state into other state (derive in render)
- run transformations already needed for render
- reset child state when props change (use `key` on child)
- fire parent notifications (call in the event handler)

Every effect that registers listeners, intervals, or fetches must return cleanup (abort controllers, `clearInterval`, unsubscribe).

## Dependencies

List every reactive value read inside the effect/callback. Do not blanket-disable `exhaustive-deps`; comment rare exceptions. Split oversized effects.

## Memoization

Default: no `useMemo`/`useCallback`. Add when profiling shows cost, when passing to `memo` children, or when stable identity is a hook dependency.

## Custom hooks

Extract when the same state+effect bundle appears in 2+ components with a nameable purpose (`useDebouncedValue`, `useMediaQuery`). Skip wrappers that only rename `useState`.

## State primitives

- Expensive initial state: `useState(() => compute())`
- Updates from prior state in async/batched code: functional updater `set(n => n + 1)`
- Related fields that always change together: single object state; otherwise split
- Many conditional transitions: `useReducer`

## Refs

DOM/imperative only; mutate `.current` in effects/handlers, not during render. `useImperativeHandle` sparingly.

## External stores

Subscribe with `useSyncExternalStore` for browser APIs or non-React stores under concurrent rendering.

## React 19+

Prefer built-ins over custom: `use()` for promises/context, `useActionState`/`useFormStatus`, `useOptimistic`, `useTransition`.

CI: treat `exhaustive-deps` warnings as errors on new code.
