# Laravel patterns

## Layers

```
app/Actions/          # single use-case classes
app/Services/         # coordination across models/gateways
app/Http/Requests/    # validation + authorize()
app/Http/Resources/   # JSON transformers
app/Models/
app/Jobs/
routes/api.php
```

Flow: **Route → Controller → FormRequest → Action/Service → Model/Repository → Resource response**.

## Routing

```php
Route::middleware('auth:sanctum')->group(function (): void {
    Route::apiResource('orders', OrderController::class);
});

Route::scopeBindings()->prefix('accounts/{account}')->group(function (): void {
    Route::get('projects/{project}', [ProjectController::class, 'show']);
});
```

- Parameter names match model keys (`{conversation}` → `Conversation`).
- `Route::model()` or `resolveRouteBinding()` when parameter names differ from class names.

## Controller + action

```php
final class OrderController extends Controller
{
    public function __construct(private PlaceOrderAction $placeOrder) {}

    public function store(StoreOrderRequest $request): JsonResponse
    {
        $order = $this->placeOrder->handle($request->toDto());

        return response()->json([
            'data' => OrderResource::make($order),
            'meta' => null,
        ], 201);
    }
}
```

## Form requests

```php
final class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Order::class) ?? false;
    }

    public function rules(): array
    {
        return [
            'customer_id' => ['required', 'integer', 'exists:customers,id'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.sku' => ['required', 'string'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
        ];
    }
}
```

## Eloquent

```php
final class Project extends Model
{
    use SoftDeletes;

    protected $fillable = ['name', 'owner_id', 'status'];

    protected $casts = ['status' => ProjectStatus::class];

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->whereNull('archived_at');
    }
}
```

- Prefer one mechanism for default filters (global scope **or** named scope, not redundant both).
- Custom `Attribute` casts for money/value objects.

## Queries

```php
Order::query()
    ->with(['customer', 'items.product'])
    ->latest('id')
    ->paginate(25);
```

Extract complex filters into query objects returning cloned builders.

## Transactions and events

```php
DB::transaction(function () use ($order): void {
    $order->markPaid();
    $order->items()->update(['paid_at' => now()]);
});

event(new OrderPaid($order));
```

Dispatch slow listeners as queued jobs (`ShouldQueue`); make handlers idempotent (unique job keys).

## API resources

Wrap collections; include pagination meta (`currentPage`, `perPage`, `total`).

## Caching

- Remember/cache expensive aggregates with TTL; tag caches when driver supports tags.
- Flush related keys on `created/updated/deleted` model events.

## Migrations

Anonymous migration classes; plural `snake_case` tables; foreign IDs `constrained()` with explicit `cascadeOnDelete()` where intended.

## Container bindings

Register interfaces → implementations in `AppServiceProvider::register()`.

## Testing pointers

Use **techne:quality** for PHPUnit/Pest strategy; feature tests hit HTTP kernel with `RefreshDatabase` or transactions per project convention.
