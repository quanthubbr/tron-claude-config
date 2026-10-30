---
paths:
  - "**/*.component.ts"
  - "**/*.component.html"
  - "**/*.service.ts"
  - "**/*.directive.ts"
  - "**/*.pipe.ts"
  - "**/*.guard.ts"
  - "**/*.resolver.ts"
  - "**/*.module.ts"
---
> Builds on the shared rules in `../common/coding-style.md`.

# Angular coding style

Confirm Angular major version (`ng version`) before signals/forms syntax. Run `ng build` after non-trivial edits.

## Files

CLI naming: `feature.widget.component.ts/html/spec.ts`, services/guards/pipes alongside feature folders. Generate via `ng generate`.

## Components

Standalone + `ChangeDetectionStrategy.OnPush` for new work. Inputs/outputs via signal `input()` / `output()` when on supported versions.

## DI

Prefer `inject()` fields; empty constructors. `InjectionToken` for config strings and feature flags.

## Signals

- `signal` / `computed` for local and derived state
- `linkedSignal` when derived state must reset with a source but remain writable
- `resource()` for async loading instead of manual subscribe boilerplate
- `effect()` only for logging/DOM side effects — never to copy one signal into another

## Templates

Control flow blocks (`@if`, `@for`) with `track` expressions. Keep templates declarative — move logic to class/computed.

## Forms

Align with repo: signal forms (newest), reactive `FormGroup` for complex validation, template-driven only for trivial cases.

## Styles

Default emulated encapsulation; `:host` styling; CSS variables for theme hooks.

Deep dives: **techne:angular** skill.
