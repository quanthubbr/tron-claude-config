# Flutter / Dart review checklist

Library-agnostic gates for PR review. Adapt rows to the project’s state library (BLoC, Riverpod, Provider, signals, etc.).

## Project and Dart hygiene

- Feature-first or layer-first layout; UI free of business rules.
- `analysis_options.yaml`: strict casts/inference/raw-types; shared in monorepos.
- No `print` in production — structured logging.
- Generated `*.g.dart` / `*.freezed.dart` committed or gitignored consistently.
- `package:` imports; `final`/`const` by default; typed catches (`on SpecificException`).
- No ignored futures without `unawaited`; no broad `catch (e)` without rethrow policy.

## Widgets

- `build` under ~100 lines; hot paths split into widget classes.
- `const` constructors and literals where fields are final.
- Keys: `ValueKey`/`ObjectKey` in reorderable lists; never `UniqueKey()` inside `build`.
- Theme-driven color/text; responsive overflow handled (`Flexible`, `FittedBox`).
- No network/IO/list sorting inside `build`; subscriptions not created per frame.

## State management

- Dependencies injected into cubits/notifiers/controllers — not constructed internally.
- Immutable snapshots (`copyWith`, freezed, records) for BLoC/Riverpod-style flows.
- Reactive stores mutate only through their API (`@action`, signal setters, etc.).
- Async flows expose distinct loading/success/error variants; UI handles all branches.
- Consumers scoped narrowly; selectors/`buildWhen`/`select` to limit rebuilds.
- Streams/`listen` canceled in `dispose`/`close`; timers cleared.
- Ephemeral UI stays local; shared state lifted minimally.

## Performance

- Builder constructors for long lists; pagination when datasets grow.
- Images: cache + decode size (`cacheWidth`/`cacheHeight`); placeholders on failure.
- `RepaintBoundary` around independently animating subtrees.
- Avoid `Opacity` in animations — prefer fade transitions.

## Navigation

- Single routing approach; typed parameters; guards not copy-pasted per screen.
- Deep links validated before navigation; back behavior verified on Android/iOS.

## Security and data

- Secrets off-device or in secure storage; API keys via compile-time env, not source.
- HTTPS only; sanitize deep links; validate forms before API calls.
- No sensitive values in logs.

## Testing and CI

- Unit coverage on domain/state; widget tests for interactions; integration for critical flows.
- State transition tests include error/retry paths.
- `flutter analyze` and tests block merge.

## Accessibility and i18n (spot-check)

- Semantic labels on custom controls; 48×48 minimum taps; contrast ≥ 4.5:1 for body text.
- User strings through l10n; locale-aware dates/numbers.
- Full visual/a11y pass → **ui-design**; platform-native patterns → **native-ui**.

## Dependencies

- Prefer maintained pub packages (pub points, recent releases, verified publisher).
- Caret constraints unless pin required; avoid production `dependency_overrides` without ticket.
- Monorepo: no `src/` imports across packages; workspace resolution for internals.

## State library cheat sheet

| Concern | BLoC | Riverpod | Provider |
|---------|------|----------|----------|
| Container | Cubit/Bloc | Notifier | ChangeNotifier |
| UI hook | BlocBuilder | ConsumerWidget | Consumer |
| Narrow rebuild | BlocSelector | `.select` | Selector |
| Side effect | BlocListener | `ref.listen` | listener callback |
| Test | `blocTest` | `ProviderContainer` | direct instance |
