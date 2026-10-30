# React testing

Behavior-first tests with React Testing Library (RTL). Accessibility depth → **ui-design**; full flows → **techne:quality** / Playwright.

## Principle

Assert what users see and do:

- Render with production-like providers
- Query by role, label, text; interact with `@testing-library/user-event`
- Check visible outcomes and side effects (callbacks, network)

Avoid: internal state, hook call counts, shallow DOM snapshots of components, mocking React.

## Runners

| Tool | Typical stack |
|------|----------------|
| Vitest | Vite, modern ESM |
| Jest | Next.js, older repos |
| Playwright CT | Needs real layout/browser APIs |

Pick one primary unit/component runner unless lanes are explicit.

## Queries (priority)

1. `getByRole`, `getByLabelText`, `getByPlaceholderText`, `getByText`
2. `getByAltText`, `getByTitle`
3. `getByTestId` last

Variants: `getBy*` (must exist), `queryBy*` (absence), `findBy*` (async appear).

## userEvent

```tsx
const user = userEvent.setup()
await user.type(screen.getByLabelText('Email'), 'a@b.co')
await user.click(screen.getByRole('button', { name: /save/i }))
```

Always await; prefer userEvent over raw `fireEvent`.

## Async

```tsx
expect(await screen.findByText('Done')).toBeInTheDocument()
await waitFor(() => expect(spy).toHaveBeenCalled())
await waitForElementToBeRemoved(() => screen.queryByText('Loading'))
```

No arbitrary `setTimeout`.

## MSW

Network-layer mocks; unhandled requests should fail tests:

```typescript
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const server = setupServer(
  http.get('/api/users/:id', ({ params }) =>
    HttpResponse.json({ id: params.id, name: 'Ada' }),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

Per-test override with `server.use(...)`.

## Providers

Central `renderWithProviders` wrapping QueryClient (retry: false), theme, router—import from `test-utils` in specs.

## Hooks

`renderHook` + `act` for updates. QueryClient instance **outside** wrapper factory to avoid cache reset flakiness.

## Accessibility in tests

```tsx
import { axe, toHaveNoViolations } from 'vitest-axe'
expect.extend(toHaveNoViolations)

test('card a11y', async () => {
  const { container } = render(<Card user={mock} />)
  expect(await axe(container)).toHaveNoViolations()
})
```

Contrast in JSDOM is limited—visual contrast in browser E2E.

## Snapshots

Avoid DOM snapshots for components. OK for pure serializers or generated config strings. Visual diffs → Playwright/Chromatic.

## RTL vs E2E

| RTL | Playwright / Cypress |
|-----|----------------------|
| Hook logic, forms, presentational UI | Layout, scroll, DnD, multi-page flows |
| Fast feedback | Real browser |

## Coverage (orienting targets)

| Layer | Aim |
|-------|-----|
| Pure utils | ~90% |
| Hooks | ~85% |
| Presentational | ~80% behavior |
| Containers | ~70% happy + error paths |
| Pages | E2E smoke + critical RTL |

```typescript
// vitest.config.ts excerpt
coverage: {
  provider: 'v8',
  thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
}
```

## Anti-patterns

`container.querySelector`, mocking children by default, ignoring `act` warnings, shared mutable fixtures, `jest.mock('react')`.

## TDD loop

Red → minimal green → refactor; start from simplest prop/render test, grow cases.

## Commands

```bash
vitest run
vitest run --coverage
CI=true vitest run --coverage
```
