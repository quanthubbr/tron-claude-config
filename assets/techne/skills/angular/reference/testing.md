# Testing

Use the runner configured in the workspace (`ng test`, Vitest, Karma, etc.).

## Unit / component

Pattern: **act → `await fixture.whenStable()` → assert** (signals, zoneless, async CD).

```ts
beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [TargetComponent] }).compileComponents();
  fixture = TestBed.createComponent(TargetComponent);
});

it('updates view', async () => {
  fixture.componentInstance.title.set('Updated');
  await fixture.whenStable();
  expect(fixture.nativeElement.textContent).toContain('Updated');
});
```

Query via `fixture.debugElement` + `By.css` when needed.

## Component harnesses

```ts
loader = TestbedHarnessEnvironment.loader(fixture);
const btn = await loader.getHarness(MatButtonHarness.with({ text: 'Save' }));
await btn.click();
```

Prefer harness interaction APIs over raw selectors — survives template refactors.

## Router

Do not mock `Router`. Provide real routes + `RouterTestingHarness`:

```ts
await TestBed.configureTestingModule({
  providers: [provideRouter([{ path: '', component: Home }])],
}).compileComponents();
harness = await RouterTestingHarness.create();
const home = await harness.navigateByUrl('/', Home);
await harness.fixture.whenStable();
expect(harness.router.url).toBe('/');
```

## E2E

Follow `package.json` / `angular.json` (`ng e2e`, Cypress, Playwright). Prefer `getByRole` / `getByLabel` or stable `data-*` attributes; assert routes/network, not fixed sleeps.

Smoke critical journeys only; deeper coverage via `techne:quality`.
