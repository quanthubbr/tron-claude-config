---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
---
> Builds on the shared rules in `../common/testing.md`.

# Angular testing

Detect runner from `angular.json` / `package.json` (Vitest, Jest, or Karma/Jasmine).

## TestBed

Import standalone components directly; `compileComponents()` when using external templates.

Signal inputs: `fixture.componentRef.setInput('name', value)` then `detectChanges()`.

## UI interaction

Prefer CDK component harnesses over `nativeElement.querySelector` — survives template refactors.

## Router

`RouterTestingHarness.create()` + `navigateByUrl` for components coupled to routes.

## Async

`fakeAsync` + `tick` for deterministic timers; `waitForAsync` + `fixture.whenStable()` for real async.

## HTTP

Provide `provideHttpClientTesting()`; inject `HttpTestingController`; `afterEach(() => httpMock.verify())`.

## Services

Configure TestBed providers only; inject service without component fixture for pure logic.

## E2E

Use project standard (Cypress/Playwright). Stable `data-cy` attributes — not CSS classes copied from design tokens.

## Coverage

≥80% on services/pipes; components assert behavior via harnesses, not private fields.

**techne:angular** skill for signal/form harness recipes.
