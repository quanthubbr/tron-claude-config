---
paths:
  - "**/*.kt"
  - "**/*.kts"
---
# Kotlin Testing

> Builds on the shared rules in `../common/testing.md`.

## Stack

kotlin.test (KMP), JUnit on Android, **Turbine** for Flow/StateFlow, **kotlinx-coroutines-test** (`runTest`).

## ViewModel

Turbine `test { }` — assert initial, loading, success/error emissions.

## Fakes

Hand-written fakes over heavy mocks for repositories.

## Coroutines

`runTest` + `advanceUntilIdle` for structured concurrency tests.

## HTTP

Ktor `MockEngine` for client tests.

## DB

In-memory Room or SQLDelight JVM driver for data layer tests.

## Layout

`commonTest`, platform unit/instrumented trees — cover ViewModel + use case per feature.

Depth: `techne:kotlin` skill.
