---
paths:
  - "**/*.ets"
  - "**/*.ts"
  - "**/module.json5"
  - "**/oh-package.json5"
  - "**/build-profile.json5"
---
# HarmonyOS / ArkTS Coding Style

> Builds on the shared rules in `../common/coding-style.md`.

ArkTS is a strict TypeScript subset — violations fail compile.

## Type system (hard limits)

Explicit types only — no `any`/`unknown`; no indexed access types, conditional types, mapped types, `infer`, intersections, structural typing, `typeof` types, or `as const`. Utility types limited to `Partial`, `Required`, `Readonly`, `Record` (`Record` indexes may be `undefined`). No type annotations in `catch`.

## Functions / classes

Arrow functions only (no function expressions/generators); no `apply`/`call`/`bind`; fields declared in class body; `this` restricted to instance methods; no `new.target`; definite-assignment assertions are banned; one static block; classes are types — do not treat as runtime values.

## Objects

Static property access (`obj.field`); no dynamic keys/`delete`; no `in` — use `instanceof`; no reassigning methods; no `globalThis`; spread only for arrays/rest.

## Modules

ESM `import`/`export` only — no `require`, `export =`, import assertions, wildcards; imports before other statements; TS must not import ArkTS (reverse allowed).

## Other

`let`/`const` only; no `for...in`, `with`, JSX, `#` privates; no declaration merging; explicit return types when inference crosses omitted returns.

## Naming

camelCase functions/vars; PascalCase types; `UPPER_SNAKE` constants; PascalCase component files, camelCase utilities.

## Format

Double-quoted strings; semicolons; full type annotations on public APIs.

## Files

One `@ComponentV2` per component file; one ViewModel per file; ~400 lines target (~800 max before split).

## Errors

```typescript
try {
  const value = await riskyCall()
  return value
} catch (error) {
  hilog.error(0x0000, 'Module', 'failed: %{public}s', error)
  throw new Error('Safe user message')
}
```

## Immutability

Return new model instances — do not mutate shared `@ObservedV2` fields in place when updating UI state.

Depth: HarmonyOS references in project docs; mobile UX audits via `ui-design` skill when applicable.
