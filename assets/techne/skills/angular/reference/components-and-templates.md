# Components and templates

## Definition

`@Component` binds selector, template (inline or `templateUrl`), styles, and `imports` for standalone usage.

```ts
@Component({
  selector: 'app-profile',
  imports: [CommonModule],
  template: `@if (visible()) { <button (click)="save()">Save</button> }`,
  styles: `:host { display: block; }`,
})
export class Profile {
  visible = signal(true);
  save() { /* persist */ }
}
```

Match project naming (suffix or not). Default since recent majors: standalone without declaring `standalone: true`.

## Control flow

- **`@if` / `@else if` / `@else`** — conditionals; `as` alias: `@if (user(); as u) { … }`.
- **`@for`** — requires `track`; locals: `$index`, `$count`, `$first`, `$last`, `$even`, `$odd`; `@empty` for empty collections.
- **`@switch`** — strict `===`, no fallthrough; `@default never` for exhaustive unions.

Nested loops: capture outer index — `$parent` does not exist.

## Inputs and outputs

```ts
export class UserRow {
  name = input('Guest');
  userId = input.required<string>();
  disabled = input(false, { transform: booleanAttribute });
  picked = output<number>();
  selection = model<string>(); // two-way [(selection)]
}
```

Prefer `input()` / `output()` / `model()` over decorators. Output names: camelCase, no `on` prefix; avoid DOM event name collisions.

## Host element

Prefer `host: { … }` in metadata over `@HostBinding` / `@HostListener`.

```ts
@Component({
  selector: 'app-slider',
  host: {
    role: 'slider',
    '[attr.aria-valuenow]': 'value()',
    '[class.active]': 'active()',
    '(keydown)': 'onKey($event)',
  },
})
export class Slider { /* … */ }
```

Static attributes: `inject(new HostAttributeToken('type'))` (optional variant available).

Binding precedence: consumer static wins over component static; dynamic vs dynamic favors component host binding.
