# Django and DRF

## Project layout

```
config/settings/{base,development,production,test}.py
apps/<domain>/{models,views,serializers,urls,services,tests}
manage.py
```

- `base.py`: installed apps, middleware, DB, REST defaults.
- `production.py`: `DEBUG=False`, TLS cookies, HSTS, structured logging.
- `test.py`: fast password hasher, in-memory email backend.

## Models and queries

- Custom `QuerySet` methods chained on managers (`active()`, `with_owner()`).
- Indexes on filter/sort columns; `CheckConstraint` for invariants SQL can enforce.
- Slug generation in `save()` only when empty.

```python
class InvoiceQuerySet(models.QuerySet):
    def open(self):
        return self.filter(status=Invoice.Status.OPEN)

    def for_tenant(self, tenant_id: int):
        return self.filter(tenant_id=tenant_id)

class Invoice(models.Model):
    objects = InvoiceQuerySet.as_manager()
    tenant = models.ForeignKey("Tenant", on_delete=models.CASCADE)
    total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        indexes = [models.Index(fields=["tenant", "-created_at"])]
```

List views: `select_related` for FK, `prefetch_related` for M2M/reverse FK.

## DRF

- Separate serializers for read vs create/update when fields differ.
- ViewSets: set `queryset` with optimizations; swap serializer in `get_serializer_class`.
- Custom `@action` for non-CRUD operations; keep bodies thin—call services.

```python
class InvoiceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated, IsTenantMember]
    filterset_fields = ["status"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return (
            Invoice.objects.for_tenant(self.request.user.tenant_id)
            .select_related("tenant")
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
```

## Service layer

```python
from django.db import transaction

class BillingService:
    @staticmethod
    @transaction.atomic
    def close_invoice(invoice: Invoice) -> Invoice:
        invoice.status = Invoice.Status.CLOSED
        invoice.save(update_fields=["status", "updated_at"])
        LedgerEntry.objects.create(invoice=invoice, amount=invoice.total)
        return invoice
```

## Caching

- Per-view: `cache_page` for stable public lists.
- Low-level: cache keys namespaced by tenant; invalidate on model save signals when needed.
- Do not cache unbounded querysets—store IDs or paginated slices.

## Signals

- Keep receivers idempotent; defer heavy work to Celery/RQ.
- Import signals in `AppConfig.ready()`.

## Middleware

- Request timing + structured log line (method, path, status, ms).
- Avoid ORM writes on every request unless required—prefer async tasks.

## Performance checklist

| Symptom | Fix |
|---------|-----|
| N+1 in templates/serializers | prefetch/select |
| Slow counts | annotate + index, or cached counter |
| Bulk imports | `bulk_create` / `bulk_update` in batches |

## Security notes

- CSRF on session-auth forms; token auth for SPA APIs as configured.
- Never expose raw tracebacks in API responses in production.
