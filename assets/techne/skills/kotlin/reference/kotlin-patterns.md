# Kotlin idioms

## Types and immutability

- Non-null parameters unless absence is meaningful; return nullable or `Result` when absence is valid.
- Wrap primitive IDs in `@JvmInline value class` with `init` validation for cheap type safety.
- Expression-bodied functions and `when` as expressions reduce noise; avoid block bodies that only `return`.

```kotlin
fun displayLabel(account: Account): String =
    account.nickname.ifBlank { account.email.substringBefore('@') }

sealed interface LoadOutcome<out T> {
    data class Ok<T>(val payload: T) : LoadOutcome<T>
    data class Err(val reason: String) : LoadOutcome<Nothing>
    data object Pending : LoadOutcome<Nothing>
}
```

## Scope functions

| Function | Returns | Typical use |
|----------|---------|-------------|
| `let` | Lambda result | Nullable chain, map value |
| `apply` | Receiver | Configure builder-style object |
| `also` | Receiver | Log or audit side effect |
| `run` / `with` | Block result | Scoped computation |

Avoid nested `let` chains; flatten with `?.` then a single `let`.

## Extensions and delegation

- Keep domain extensions near the type or inside a dedicated file per bounded context.
- Decorator repos: `class AuditingRepo(private val inner: UserRepo) : UserRepo by inner` — override only intercepted calls.

## Collections and laziness

- Eager pipelines for small lists; `asSequence()` when filtering/mapping large collections before `take`.
- `associateBy`, `groupBy`, `partition` beat manual loops for maps and splits.

## DSL builders

- Mark DSL scopes with `@DslMarker` to block accidental outer receiver calls.
- Prefer typed builders for config (server, HTTP client) over stringly maps.

## Gradle Kotlin DSL (check current versions on kotlinlang.org)

```kotlin
plugins {
    kotlin("jvm") version "2.3.10"
    id("org.jetbrains.kotlinx.kover") version "0.9.7"
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
    testImplementation("io.kotest:kotest-runner-junit5:6.1.4")
    testImplementation("io.mockk:mockk:1.14.9")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.10.2")
}

tasks.withType<Test> { useJUnitPlatform() }
```

## Errors

- `require` for caller mistakes; `check` for internal invariants.
- `runCatching { }` at boundaries; map to domain errors before UI.

## Avoid

- Mutable `data class` fields; platform types from Java without null handling.
- `GlobalScope`; deep scope-function nesting; mocking value types in tests (use real instances).
