# React component patterns

React 18/19 function components, hooks, RSC-aware composition.

## Core rules

- **Pure render**: derive totals, filters, labels in render body—not `useEffect` syncing from props.
- **Effects for external sync**: subscriptions, DOM bridges, logging—not for derived UI state.
- **Composition**: slots via `children`, named props, or compound components with context.

## Hooks

- Call hooks unconditionally at top level.
- Clean up listeners/intervals/subscriptions in effect returns.
- Functional `setState` when next value depends on previous.
- Extract custom hooks when the same hook bundle repeats in 2+ components.
- Default: no memoization until profiler or child memo requires stable references.

## State decision tree

```
One component only → useState
Parent + shallow tree → lift state
Rare global reads → split Context per concern
Hot shared updates → Zustand/Jotai/RTK
Server-backed → TanStack Query / SWR / RSC fetch
```

## Server / Client (App Router)

```tsx
// Server (default): async, no client JS for this module
export default async function Page({ params }: { params: { id: string } }) {
  const row = await db.item.findUnique({ where: { id: params.id } })
  if (!row) notFound()
  return <Detail item={row} />
}

'use client'
export function BuyButton({ sku }: { sku: string }) {
  const [busy, start] = useTransition()
  return (
    <button disabled={busy} onClick={() => start(() => addToCart(sku))}>
      {busy ? 'Adding…' : 'Add'}
    </button>
  )
}
```

- Pass serializable props or `children` from server → client.
- Server Actions from forms or events; never import server modules into client files.

## Suspense + errors

Nest `<Suspense>` near data consumers; wrap with error boundary (class or `react-error-boundary`). Boundaries catch render/lifecycle throws—not event handler errors.

## Forms

- React 19: `useActionState` + server action with schema validation (Zod, etc.).
- Controlled inputs when value drives other UI or live validation.
- Non-trivial wizards → React Hook Form / TanStack Form.

## Data fetching matrix

| Need | Tool |
|------|------|
| Per-request in App Router | RSC `await fetch()` |
| Client cache + mutations | TanStack Query |
| Lightweight revalidate | SWR |
| One-off user action | `fetch` in handler |

## Composition recipes

Named slots: `<Shell header={<Nav />} aside={<Filters />}>{body}</Shell>`

Compound tabs pattern with context (see **techne:web** reference) or headless UI primitives.

## Performance (basics)

`React.memo` only if child is expensive and props often unchanged. Split context so theme changes do not rerender notification consumers. List keys = stable ids; virtualize long lists.

## Accessibility

Semantic HTML before ARIA. Label every input. Move focus on route/modal changes. Component tests: axe (see **react-testing** reference). Full audit → **ui-design**.

## Examples

**Debounced search + query**

```tsx
function useDebounced<T>(value: T, ms = 300) {
  const [out, setOut] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setOut(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return out
}

function Search() {
  const [q, setQ] = useState('')
  const debounced = useDebounced(q)
  const { data } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => apiSearch(debounced),
    enabled: debounced.length > 0,
  })
  return (
    <>
      <input value={q} onChange={e => setQ(e.target.value)} />
      <ResultList items={data ?? []} />
    </>
  )
}
```

**Optimistic list (React 19)**

```tsx
'use client'
import { useOptimistic } from 'react'

export function Thread({ messages }: { messages: Msg[] }) {
  const [view, append] = useOptimistic(messages, (cur, msg: Msg) => [...cur, msg])
  async function send(fd: FormData) {
    const text = String(fd.get('text'))
    append({ id: 'tmp', text })
    await persist(text)
  }
  return (
    <>
      <ul>{view.map(m => <li key={m.id}>{m.text}</li>)}</ul>
      <form action={send}><input name="text" /><button>Send</button></form>
    </>
  )
}
```

Router-specific loaders (React Router, TanStack Router) follow that router's docs—patterns above are core React.
