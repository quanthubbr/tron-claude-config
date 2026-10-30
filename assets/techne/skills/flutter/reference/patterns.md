# Flutter implementation patterns

## Null safety and records

```dart
String label(Account? account) => switch (account) {
  Account(:final name, :final email) => '$name <$email>',
  null => 'Guest',
};

Future<SummaryBundle> loadSummary(UserRepo users, OrderRepo orders) async {
  final (people, purchases) = await (users.all(), orders.recent()).wait;
  return SummaryBundle(users: people, orders: purchases);
}
```

## Immutable state

```dart
sealed class LoadState<T> {}
final class Idle<T> extends LoadState<T> {}
final class Pending<T> extends LoadState<T> {}
final class Ready<T> extends LoadState<T> { const Ready(this.value); final T value; }
final class Failed<T> extends LoadState<T> { const Failed(this.reason); final Object reason; }

Widget body(LoadState<User> state) => switch (state) {
  Idle() => const SizedBox.shrink(),
  Pending() => const CircularProgressIndicator(),
  Ready(:final value) => ProfileCard(user: value),
  Failed(:final reason) => ErrorBanner(reason.toString()),
};
```

`freezed` + json_serializable when you need `copyWith`/serialization without boilerplate.

## Widget architecture

Isolate reactive subtrees:

```dart
class DashboardPage extends StatelessWidget {
  const DashboardPage({super.key});
  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Column(children: [
        StaticHeader(),
        _LiveCounter(),
        StaticFooter(),
      ]),
    );
  }
}

class _LiveCounter extends ConsumerWidget {
  const _LiveCounter();
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final n = ref.watch(counterProvider);
    return Text('$n');
  }
}
```

## BLoC sketch

```dart
class SignInCubit extends Cubit<SignInState> {
  SignInCubit(this._auth) : super(const SignInState.idle());
  final AuthGateway _auth;

  Future<void> submit(String email, String password) async {
    emit(const SignInState.busy());
    try {
      final profile = await _auth.signIn(email, password);
      emit(SignInState.done(profile));
    } on AuthFailure catch (err) {
      emit(SignInState.problem(err.message));
    }
  }
}
```

## Riverpod sketch

```dart
@riverpod
Future<List<CatalogItem>> catalog(CatalogRef ref) async {
  return ref.watch(catalogGatewayProvider).fetch();
}

@riverpod
class Basket extends _$Basket {
  @override
  List<BasketLine> build() => [];

  void increment(CatalogItem item) {
    final hit = state.where((l) => l.sku == item.id).firstOrNull;
    state = hit == null
        ? [...state, BasketLine(sku: item.id, qty: 1)]
        : [for (final l in state) if (l.sku == item.id) l.copyWith(qty: l.qty + 1) else l];
  }
}
```

Derive totals with a separate provider; use `firstWhereOrNull` when joining optional catalogs.

## GoRouter + auth

```dart
final appRouter = GoRouter(
  refreshListenable: GoRouterRefreshStream(signInCubit.stream),
  redirect: (ctx, loc) {
    final signedIn = ctx.read<SignInCubit>().state is SignInDone;
    final onLogin = loc.matchedLocation == '/login';
    if (!signedIn && !onLogin) return '/login';
    if (signedIn && onLogin) return '/';
    return null;
  },
  routes: [
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    ShellRoute(
      builder: (_, __, child) => AppScaffold(child: child),
      routes: [
        GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
        GoRoute(
          path: '/item/:sku',
          builder: (ctx, state) => ItemScreen(sku: state.pathParameters['sku']!),
        ),
      ],
    ),
  ],
);
```

## Dio client

```dart
final client = Dio(BaseOptions(
  baseUrl: const String.fromEnvironment('API_BASE'),
  connectTimeout: const Duration(seconds: 10),
  receiveTimeout: const Duration(seconds: 30),
));

client.interceptors.add(InterceptorsWrapper(
  onRequest: (opts, next) async {
    final token = await vault.read('access');
    if (token != null) opts.headers['Authorization'] = 'Bearer $token';
    next.next(opts);
  },
  onError: (err, next) async {
    final retried = err.requestOptions.extra['_retried'] == true;
    if (!retried && err.response?.statusCode == 401 && await refreshTokens()) {
      err.requestOptions.extra['_retried'] = true;
      return next.resolve(await client.fetch(err.requestOptions));
    }
    next.next(err);
  },
));
```

## Errors in `main`

```dart
void main() {
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    reporter.recordFlutterFatalError(details);
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    reporter.recordError(error, stack, fatal: true);
    return true;
  };
  runApp(const RootApp());
}
```

Set `ErrorWidget.builder` in release for user-safe fallbacks.

## Testing snippets

```dart
blocTest<SignInCubit, SignInState>(
  'busy then problem on bad password',
  build: () => SignInCubit(FakeAuth(reject: true)),
  act: (c) => c.submit('a@b.c', 'bad'),
  expect: () => [const SignInState.busy(), isA<SignInProblem>()],
);

testWidgets('badge count', (tester) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [basketProvider.overrideWith(() => FakeBasket(qty: 2))],
      child: const MaterialApp(home: BasketBadge()),
    ),
  );
  expect(find.text('2'), findsOneWidget);
});
```

Use fakes over heavy mocks; test state transitions, not private fields.
