---
name: flutter
description: Flutter and Dart application engineering — null-safe idioms, immutable state (sealed/freezed), widget architecture, BLoC/Riverpod/Provider patterns, GoRouter guards, Dio networking, errors, testing, and review checklists. Use when implementing or reviewing Flutter features, navigation, async UI, or Dart architecture.
---

Dart and Flutter patterns for production apps: data flow, widgets, routing, HTTP, and quality gates. Platform chrome, adaptive UI, and native feel → **native-ui**; deep accessibility audits → **ui-design** (`audit`, `harden`).

## Non-negotiable rules

1. **Null-safe idioms** — Avoid `!`; use `?.`, `??`, early returns, and Dart 3 patterns; reserve `late` for guaranteed init (e.g. `AnimationController` in `initState`).
2. **Explicit async state** — Sealed hierarchies or `freezed` unions for loading/success/failure; no overlapping `isLoading` + `hasError` booleans.
3. **Widget classes, not builders** — Extract `_buildX()` helpers into `StatelessWidget`/`ConsumerWidget` subclasses; push `const` through the tree.
4. **Narrow rebuilds** — Watch providers/blocs only in the smallest subtree; keep static chrome `const`.
5. **Context safety** — After every `await` in widgets, guard with `mounted` / `context.mounted` before navigation, snackbars, or `setState`.
6. **Layer separation** — Widgets render; state containers (Cubit, Notifier, etc.) orchestrate; repositories talk to APIs/DB — inject dependencies, no god objects.
7. **Routing** — One declarative router (typically GoRouter); auth redirects and deep links centralized; typed route args, not raw maps.
8. **HTTP** — Timeouts on the client; auth header interceptor; at most **one** token-refresh retry per request (flag in `extra`).
9. **Lists** — `ListView.builder` / `GridView.builder` (or pagination) for large datasets; no unbounded `children:` lists.
10. **Theming** — Colors and text from `Theme.of(context)`; no scattered magic hex in widgets.
11. **Analysis** — Root `analysis_options.yaml` with strict casts/inference/raw-types; `flutter analyze` clean in CI.
12. **Secrets** — Tokens in platform secure storage; config via `--dart-define` or env excluded from VCS; never log credentials.
13. **Review routing** — Systematic review → **exo-qa** / code-review skill; security pass → **exo-security**; library APIs → **biblos** MCP.

## References

| File | Load when |
|------|-----------|
| [reference/patterns.md](reference/patterns.md) | Writing features — state, widgets, GoRouter, Dio, errors, tests |
| [reference/code-review.md](reference/code-review.md) | Reviewing a PR or auditing project health across Dart/Flutter layers |
