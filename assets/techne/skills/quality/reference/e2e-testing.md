# Playwright E2E

Stable suites for critical journeys. Prefer fewer, high-signal specs over exhaustive UI duplication of unit tests.

## Layout

```
tests/e2e/
  auth/sign-in.spec.ts
  catalog/search.spec.ts
tests/fixtures/session.ts
tests/pages/CatalogPage.ts
playwright.config.ts
```

## Page object

```typescript
import { Page, Locator } from '@playwright/test'

export class CatalogPage {
  readonly page: Page
  readonly query: Locator
  readonly cards: Locator

  constructor(page: Page) {
    this.page = page
    this.query = page.getByTestId('search-input')
    this.cards = page.getByTestId('item-card')
  }

  async open() {
    await this.page.goto('/catalog')
    await this.page.waitForLoadState('domcontentloaded')
  }

  async find(term: string) {
    await this.query.fill(term)
    await this.page.waitForResponse(r => r.url().includes('/api/search') && r.ok())
  }
}
```

## Spec shape

```typescript
import { test, expect } from '@playwright/test'
import { CatalogPage } from '../pages/CatalogPage'

test.describe('Catalog search', () => {
  test('shows matches for a known term', async ({ page }) => {
    const catalog = new CatalogPage(page)
    await catalog.open()
    await catalog.find('adapter')
    await expect(catalog.cards.first()).toContainText(/adapter/i)
  })
})
```

## Config highlights

- `testDir`, `fullyParallel`, `forbidOnly: !!process.env.CI`
- Retries: 0 local, 1–2 in CI; workers ↓ in CI if flaky
- Reporters: HTML + JUnit/JSON for CI
- `use.baseURL` from env; `trace: 'on-first-retry'`, `screenshot`/`video` on failure
- `webServer` block to boot dev server when needed

## Flakes

Diagnose:

```bash
npx playwright test path/spec.ts --repeat-each=10
```

| Cause | Fix |
|-------|-----|
| Race | Locators with auto-wait; `waitForResponse` |
| Animation | `waitFor({ state: 'visible' })` |
| Shared state | Isolated storage / fresh user per test |

Quarantine: `test.fixme(true, 'issue #N')` or `test.skip(condition, reason)` — always link ticket.

## Artifacts

Screenshots under `artifacts/`; traces via retry config; upload `playwright-report/` from CI (`retention-days` ≥ 14).

## CI sketch

Checkout → install deps → `npx playwright install --with-deps` → `npx playwright test` with `BASE_URL` → upload report on `always()`.

## Special flows

- **Wallet / injected provider** — `context.addInitScript` stub `window.ethereum` (or app-specific bridge).
- **Money or prod** — `test.skip` on production; use staging fixtures only.

Report template: date, duration, pass/fail counts, failed spec + line, screenshot path, suggested fix.

Interactive post-deploy checks → [browser-qa.md](browser-qa.md) (MCP-driven smoke beyond CI specs).
