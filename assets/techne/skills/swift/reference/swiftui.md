# SwiftUI structure and performance

## State and view models

Track mutations at property granularity with `@Observable`:

```swift
@Observable
final class CatalogModel {
    private(set) var entries: [Entry] = []
    private(set) var busy = false
    var filter = ""
    private let gateway: any CatalogGateway

    init(gateway: any CatalogGateway = LiveCatalogGateway()) {
        self.gateway = gateway
    }

    func refresh() async {
        busy = true
        defer { busy = false }
        entries = (try? await gateway.load()) ?? []
    }
}
```

Host owned models with `@State` on the root screen:

```swift
struct CatalogScreen: View {
    @State private var model: CatalogModel

    init(model: CatalogModel = CatalogModel()) {
        _model = State(initialValue: model)
    }

    var body: some View {
        List(model.entries) { row in EntryRow(entry: row) }
            .searchable(text: $model.filter)
            .overlay { if model.busy { ProgressView() } }
            .task { await model.refresh() }
    }
}
```

Inject shared services via environment:

```swift
RootTabs()
    .environment(sessionCoordinator)

struct AccountPane: View {
    @Environment(SessionCoordinator.self) private var session
    var body: some View { Text(session.displayName ?? "Signed out") }
}
```

## Composition

Pass only the data each child reads:

```swift
struct CheckoutScreen: View {
    @State private var model = CheckoutModel()
    var body: some View {
        VStack {
            CheckoutHeader(title: model.title)
            LineItemStack(items: model.lines)
            CheckoutFooter(total: model.grandTotal)
        }
    }
}
```

Reusable chrome via modifiers:

```swift
struct PanelChrome: ViewModifier {
    func body(content: Content) -> some View {
        content.padding().background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
extension View { func panelChrome() -> some View { modifier(PanelChrome()) } }
```

## Navigation

Centralize path mutations:

```swift
@Observable
final class AppRouter {
    var stack = NavigationPath()
    func open(_ target: Screen) { stack.append(target) }
    func reset() { stack = NavigationPath() }
}

enum Screen: Hashable {
    case detail(UUID)
    case preferences
}

struct ShellView: View {
    @State private var router = AppRouter()
    var body: some View {
        NavigationStack(path: $router.stack) {
            HubView()
                .navigationDestination(for: Screen.self) { screen in
                    switch screen {
                    case .detail(let id): DetailPane(id: id)
                    case .preferences: PreferencesPane()
                    }
                }
        }
        .environment(router)
    }
}
```

## Performance tactics

- Lazy stacks inside `ScrollView` for long content.
- `Equatable` on expensive leaf views when inputs are equatable — compare only fields that affect rendering.
- Avoid expensive effects in cells; prefer `.geometryGroup()` and haptics outside fast scroll regions when needed.

```swift
ScrollView {
    LazyVStack(spacing: 8) {
        ForEach(rows, id: \.persistentKey) { row in RowView(row: row) }
    }
}
```

## Avoid

- Child-owned `@State` view models for data the parent already owns — pass the model down.
- Legacy observation wrappers in greenfield code.
- Async side effects directly inside `body`.
