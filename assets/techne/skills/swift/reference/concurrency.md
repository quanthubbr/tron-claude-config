# Swift 6.2 concurrency

Approachable Concurrency keeps most code on one actor until you opt into parallelism. Enable features incrementally in Xcode build settings or SPM `SwiftSettings` (MainActor default inference, nonisolated-nonsending-by-default).

## Calling actor stays put

Earlier runtimes could hop threads implicitly inside `async` work on `@MainActor` types, surfacing false-positive send errors. Swift 6.2 keeps continuation on the caller’s executor unless you mark otherwise:

```swift
@MainActor
final class ImportModel {
    let pipeline = ImagePipeline()

    func buildSticker(from pickerItem: PhotosPickerItem) async throws -> Sticker? {
        guard let payload = try await pickerItem.loadTransferable(type: Data.self) else { return nil }
        return await pipeline.renderSticker(payload, id: pickerItem.itemIdentifier)
    }
}
```

## Isolated protocol conformances

UI-bound types can conform without erasing isolation:

```swift
protocol Exporting { func exportPNG() }

extension ImportModel: @MainActor Exporting {
    func exportPNG() { pipeline.flushPNG() }
}
```

Using that conformance from a nonisolated store fails at compile time — intentional.

## Globals and shared caches

Annotate process-wide mutable singletons with `@MainActor`:

```swift
@MainActor
final class AssetCache {
    static let shared = AssetCache()
}
```

With **MainActor default inference** (recommended for app executables), class members inherit main-actor isolation without repeating annotations.

## Explicit background work

Requirements: approachable-concurrency flags enabled (otherwise the sample below races).

```swift
nonisolated final class ImagePipeline {
    private var memo: [String: Sticker] = [:]

    func renderSticker(_ data: Data, id: String?) async -> Sticker {
        if let id, let hit = memo[id] { return hit }
        let sticker = await Self.segmentSubject(from: data)
        if let id { memo[id] = sticker }
        return sticker
    }

    @concurrent
    static func segmentSubject(from data: Data) async -> Sticker { /* CPU work */ }
}
```

Steps to offload: container `nonisolated`, hot function `@concurrent` + `async`, call sites `await`.

## Migration checklist

1. Turn on Swift 6 language mode concurrency checks.
2. Enable MainActor inference for app targets first.
3. Fix globals and protocol conformances with isolation, not suppression.
4. Profile, then add `@concurrent` on proven CPU bottlenecks (decode, compression, layout solvers).
5. Re-run tests — many races become build failures instead of heisenbugs.

## Avoid

- Sprinkling `@concurrent` on every `async` function.
- `nonisolated` solely to silence diagnostics.
- Legacy `DispatchQueue` patterns where actors express the same contract more clearly.
- Assuming all `async` calls run off the main thread.
