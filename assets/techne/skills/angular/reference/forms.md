# Forms

## Choose an API

| Situation | API |
|-----------|-----|
| New app on version with signal forms | `@angular/forms/signals` |
| Legacy codebase | Match existing (reactive or template) |
| Simple two-way template | Template-driven + `FormsModule` |
| Complex dynamic trees | Reactive `FormGroup`/`FormArray` or signal forms |

## Signal forms essentials

Model is a `signal` with concrete defaults (`''`, `0`, `[]`) — never `null`/`undefined` field values.

```ts
import { form, FormField, submit, required, email } from '@angular/forms/signals';

model = signal({ email: '', age: 0 });
profileForm = form(this.model, (p) => {
  required(p.email, { message: 'Required' });
  email(p.email);
});
```

Template: `[formField]="profileForm.email"`. Flags: **call** the field — `profileForm.email().invalid()`, root `profileForm().invalid()`.

Schema rules: `disabled`, `hidden`, `readonly`, `debounce`, `validate`, `validateAsync`, `applyWhen`, `applyEach` (single path arg). Context uses `value()`, `state.touched()`, `valueOf(path)`, `stateOf(path)` — paths in schema callbacks are not callable.

Do **not** put `min`/`max`/`value`/`disabled`/`readonly` on `[formField]` inputs — encode in schema.

Submit: `submit(form, async () => { … })` — callback must be `async`.

Async validation: `validateAsync` needs `params: ({ value }) => value()`, `factory`, `onSuccess`, **required** `onError`. Pair with `resource({ params: signal, loader })`.

Arrays: mutate model signal; `@for` over `form.items`; length via structural `form.items.length`. Multi-select arrays: `<select multiple>` or checkboxes (boolean only per checkbox).

## Reactive forms

`ReactiveFormsModule`, `FormBuilder`, `formControlName`, `patchValue` / `setValue`, unified `events` stream (`ValueChangeEvent`, etc.).

## Template-driven

`FormsModule`, `[(ngModel)]` **requires** `name`, `#f="ngForm"`, validation CSS classes (`ng-valid`, `ng-invalid`, …).

## Signal forms pitfall matrix

| Mistake | Fix |
|---------|-----|
| `field.valid()` | `field().valid()` |
| `form.invalid()` | `form().invalid()` |
| `field.set(x)` | Update backing model signal |
| `form.items().length` | `form.items.length` (structural) |
| `({ touched }) => …` in validate | `({ state }) => state.touched()` |
| `applyWhen(p.x, () => p.x() …)` | `valueOf(p.x)` / `stateOf(p.x)` |
| `pattern(..., { when })` | `when` only on `required()` |
| `submit(form, () => …)` | `async` callback required |
| `validateAsync` without `onError` | always supply `onError` |
| `resource({ request: sig })` | use `params: sig` |
| `applyEach(..., (item, i) => …)` | single `(item) =>` arg |
| Checkbox on `string[]` field | checkboxes bind `boolean` only |
| `[readonly]` on input with `[formField]` | `readonly()` in schema |

## Custom validators

Synchronous `validate(path, ({ value, valueOf, state }) => …)` returns `{ kind, message? }` or `undefined`. Do not return `null`.

Conditional blocks: `applyWhen(path, predicate, (subPath) => { required(subPath.x); })` — three arguments.

HTTP-backed rules: `validateHttp` / `validateStandardSchema` when integrating external schema libraries (check version docs via `biblos` MCP).

## End-to-end sketch

```ts
@Component({ imports: [FormField], template: `
  <form (submit)="save(); $event.preventDefault()">
    <input [formField]="f.contact.email" />
    @if (f.contact.email().touched() && f.contact.email().errors().length) {
      <span>{{ f.contact.email().errors()[0].message }}</span>
    }
    <button [disabled]="f().invalid() || f().pending()">Send</button>
  </form>` })
export class ContactPage {
  model = signal({ contact: { email: '' } });
  f = form(this.model, (p) => {
    required(p.contact.email);
    email(p.contact.email);
  });
  save() {
    submit(this.f, async () => {
      await this.api.post('/contacts', this.model());
    });
  }
}
```

Dynamic rows: push into `model` array; `applyEach` on collection path; template `@for (row of f.items; track $index)` with `[formField]="row.label"`.
