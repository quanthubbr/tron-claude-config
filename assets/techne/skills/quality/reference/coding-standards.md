# Coding standards (cross-stack floor)

Shared quality rules before stack skills (**techne:web**, **techne:react**, **techne:services**, etc.) and `.claude/rules/exonous/`. Framework depth lives in those targets; this file is the review checklist.

## Principles

- **Readable names** over comments; format consistently.
- **KISS / YAGNI** — smallest working design; no speculative layers.
- **DRY** — extract on the second real duplication, not the first guess.

## TypeScript / JavaScript

```typescript
// Names: domain + role
const searchQuery = 'annual report'
const isSignedIn = true

// Functions: verb + object
async function loadInvoice(id: string) { /* … */ }

// Updates: copy, don’t mutate
const next = { ...record, status: 'paid' }
const rows = [...items, row]
```

- Prefer `Promise.all` for independent async work.
- Typed interfaces for domain entities; ban `any` (use `unknown` + narrow).
- Errors: handle HTTP status, log with context, rethrow or map to user-safe messages — never swallow.

## React (summary)

Full patterns → **techne:react**. Floor:

- Props interface on exported components.
- Functional updates when next state depends on previous.
- Split loading / error / data in JSX instead of nested ternaries.

## HTTP APIs (summary)

Detail → **techne:services**. Floor:

| Method | Use |
|--------|-----|
| GET | Read collection or entity |
| POST | Create |
| PUT/PATCH | Replace / partial update |
| DELETE | Remove |

Envelope: `{ success, data?, error?, meta? }` with correct status codes; validate body with schema library (e.g. Zod) before side effects.

## Files

- Components: `PascalCase.tsx`
- Hooks/utils: `camelCase.ts`
- Colocate tests: `Feature.test.ts(x)` beside source or mirror under `tests/`

## Comments & docs

Comment non-obvious tradeoffs (retries, caching, intentional mutation). Public modules: short JSDoc with params, return, thrown errors, one example.

## Performance (when touching hot paths)

- Memoize expensive derived lists (copy before sort).
- Lazy-load heavy routes/charts.
- DB/API: select needed columns/fields, paginate.

## Tests (AAA)

```typescript
test('returns empty list when filter matches nothing', () => {
  const catalog = makeCatalog([])
  const out = filterCatalog(catalog, 'zzz')
  expect(out).toEqual([])
})
```

Name tests as specifications: outcome under condition.

## Smells → fix

| Smell | Action |
|-------|--------|
| Function &gt; ~50 lines | Extract steps |
| Nesting &gt; 3 levels | Early return / guard |
| Magic numbers | Named constants |
| Copy-pasted blocks | Shared helper |

Accessibility and visual polish → **ui-design**, not this file.
