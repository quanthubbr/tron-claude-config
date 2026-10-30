# Kotlin testing

Standard stack: **Kotest** (specs + matchers), **MockK** (mocks/spies), **kotlinx-coroutines-test** (`runTest`, virtual time), **Kover** (coverage). Align red-green-refactor with **techne:quality**; do not mix JUnit-style assertion libraries on the same suite.

## Spec styles (pick one per module)

- **StringSpec** — flat `"description" { }` cases; good for pure functions.
- **FunSpec** — `test("…") { }`; familiar JUnit shape; pairs well with MockK `beforeTest`.
- **BehaviorSpec** — Given/When/Then for multi-step workflows.
- **DescribeSpec** — nested `describe`/`context`/`it`.

## MockK essentials

```kotlin
class BillingServiceTest : FunSpec({
    val gateway = mockk<PaymentGateway>()
    val sut = BillingService(gateway)

    beforeTest { clearMocks(gateway) }

    test("charges on success") {
        coEvery { gateway.charge(any()) } returns ChargeResult.Approved
        sut.pay(OrderFixtures.valid).isSuccess shouldBe true
        coVerify(exactly = 1) { gateway.charge(match { it.amount > 0 }) }
    }
})
```

- Blocking APIs: `every` / `verify`.
- Suspend APIs: `coEvery` / `coVerify`.
- Capture args: `slot<T>()` + `capture(slot)`.
- Prefer real data classes over mocking them; use `relaxed = true` only for loggers/noise.

## Coroutines in tests

```kotlin
test("debounced search fires once") {
    runTest {
        val repo = FakeSearchRepo()
        val engine = SearchEngine(repo, debounceMs = 300)

        engine.submitQuery("a")
        engine.submitQuery("ab")
        engine.submitQuery("abc")
        advanceTimeBy(350)

        repo.searchCallCount shouldBe 1
    }
}
```

- Inject `StandardTestDispatcher` when testing custom scopes; call `advanceUntilIdle()` before assertions on `StateFlow`.

## Flow assertions

- Collect with Turbine: `flow.test { awaitItem(); cancelAndIgnoreRemainingEvents() }`.
- Or `toList()` on finite flows inside `runTest`.

## Property tests

```kotlin
test("sort is idempotent") {
    checkAll(Arb.list(Arb.int())) { nums ->
        val once = nums.sorted()
        once shouldBe once.sorted()
    }
}
```

Define `Arb` builders for domain types (email, money) near test fixtures.

## Data-driven cases

Use Kotest `withData` for table-driven inputs (valid/invalid parsers, date formats).

## Lifecycle fixtures

- `beforeSpec` / `afterSpec` for expensive setup (in-memory DB).
- Extract reusable listeners into Kotest extensions registered with `register(ext)`.

## Kover

```kotlin
kover {
    reports {
        filters.excludes.classes("*.generated.*", "*.BuildConfig")
        verify.rule { minBound(80) }
    }
}
```

Commands: `./gradlew test`, `./gradlew koverHtmlReport`, `./gradlew koverVerify`, `./gradlew test --tests "com.acme.pkg.ClassName"`.

| Layer | Coverage expectation |
|-------|---------------------|
| Critical domain rules | 100% target |
| Public service API | 90%+ |
| General code | 80%+ floor |

## Ktor HTTP tests

```kotlin
test("GET /health") {
    testApplication {
        application { installHealthRoutes() }
        client.get("/health").status shouldBe HttpStatusCode.OK
    }
}
```

## Practices

- Assert behavior and contracts, not private methods.
- Fix flaky tests; do not `@Ignore` without a tracked defect.
- CI: run `test` + `koverXmlReport` + `koverVerify` (see **techne:delivery** for pipeline wiring).
