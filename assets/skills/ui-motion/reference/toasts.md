# Sonner — React toasts

Guide for [Sonner](https://sonner.emilkowal.ski): mount once, call `toast()` from client code, style and debug. Exact prop tables below; options on `toast()` override Toaster defaults.

## Setup

1. **Single `<Toaster />`** near app root (Next.js `layout.tsx` works in RSC). Never per-page or conditional — duplicates every toast.
2. **`toast()` from client** — handlers, effects, callbacks. Server actions: return data; call `toast()` where the client handles the response.

```jsx
import { Toaster } from 'sonner';
import { toast } from 'sonner';
```

## Choosing an API

| Goal | API |
| --- | --- |
| Simple line | `toast('Title')` + optional `{ description }` |
| Typed icon | `toast.success` / `.error` / `.info` / `.warning` |
| Manual loading → done | `toast.loading` then update same `id` |
| Promise lifecycle | `toast.promise(promise, { loading, success, error })` — success/error may be functions of result |
| Primary action | `{ action: { label, onClick } }` — closes unless `preventDefault` on click |
| Secondary | `{ cancel: { label, onClick } }` |
| JSX in default chrome | `toast(<Node />)` |
| Full custom shell | `toast.custom((t) => <Node />)` — `t` has id for dismiss |

## Patterns

**Update by id**

```jsx
const handleUpload = async () => {
  const id = toast.loading('Sending file…');
  await upload();
  toast.success('Sent', { id });
};
```

**Persist / dismiss / inspect**

- `{ duration: Infinity }` keeps open
- `toast.dismiss(id)` or `toast.dismiss()` for all
- `useSonner()` → `{ toasts }` in React; `toast.getActiveToasts()` outside

**Rich title/description** — function returning JSX: `toast(() => <a href="/item">Open</a>)`

**Multiple toasters** — unique `id` on each `<Toaster />`; target with `toast('…', { toasterId: 'sidebar' })`. Omitting `toasterId` broadcasts to all.

**Close hooks** — `onDismiss` (button/swipe); `onAutoClose` (timeout). No combined callback.

## Styling ladder (climb only as needed)

1. Defaults; `richColors` for vivid success/error; `invert` for contrast flip.
2. `toastOptions={{ style: { … } }}` global or per-call `style`.
3. `classNames` on toast parts — injected Sonner CSS wins; Tailwind needs `!` prefix. Many `!important`s → go headless.
4. **`toast.custom()`** — recommended for design-system toasts; wrap in your own helper. (`unstyled: true` is partial escape hatch.)

**Icons** — Toaster `icons` map or per-toast `icon`; `null` removes default.

**Theme** — default `theme='light'` ignores OS. Use `theme="system"` or `<Toaster theme={resolvedTheme} />` from your theme provider.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Never shows | No root Toaster, or unmounted. Client-only from server actions. |
| Duplicate | Two Toasters (layout + page). StrictMode double effect → fire from handler or stable `id`. |
| Classes ignored | Defaults win — `!important`, `unstyled`, or custom. |
| Unstyled (Astro, view transitions) | `import 'sonner/dist/styles.css'` in layout. |
| Shadow DOM | Copy `[data-sonner-toaster]` style tag into shadow root. |
| Behind modal / clipped | Stacking context (`transform`, `filter`, `overflow`) or z-index — mount Toaster at document root outside dialogs. |
| Dark mode wrong | Set system or resolved theme prop. |
| Gray success/error | Enable `richColors`. |
| Won't close | `duration: Infinity`, `dismissible: false`, or unsettled `toast.promise`. |
| promise stuck loading | Must pass settling Promise; success/error configs valid. |
| Swipe wrong axis | Set `swipeDirections` on Toaster; defaults follow `position`. |
| Every toaster shows toast | Use `toasterId` pairing. |
| Mobile edge tight | `offset` (default 32px desktop), `mobileOffset` (16px &lt;600px) — number, string, or per-side object. |

---

## API reference

### `<Toaster />`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `theme` | `string` | `'light'` | `'light'`, `'dark'`, `'system'`. |
| `richColors` | `boolean` | `false` | Stronger error/success color. |
| `expand` | `boolean` | `false` | Expanded stack default (else expand on hover). |
| `visibleToasts` | `number` | `3` | Visible count. |
| `id` | `string` | – | Matched by `toast({ toasterId })`. |
| `position` | `string` | `'bottom-right'` | `top-left`, `top-center`, `top-right`, `bottom-left`, `bottom-center`, `bottom-right`. |
| `closeButton` | `boolean` | `false` | Close on all toasts. |
| `offset` | `string \| number \| object` | `'32px'` | Edge inset; object per side e.g. `{ bottom: '24px', right: '16px' }`. |
| `mobileOffset` | `string \| number \| object` | `'16px'` | Inset when width &lt; 600px. |
| `swipeDirections` | `array` | from position | Allowed dismiss swipe directions. |
| `dir` | `string` | `'ltr'` | Text direction. |
| `hotkey` | `string` | `⌥/alt + T` | Focus toaster region. |
| `invert` | `boolean` | `false` | Invert light/dark toast surface. |
| `toastOptions` | `object` | – | Defaults for every `toast()` option below. |
| `gap` | `number` | `14` | Gap when expanded. |
| `icons` | `object` | – | `{ success, info, warning, error, loading }`; `null` clears one. |

### `toast(message, options?)`

Message: string, JSX, or function → JSX. Returns toast id.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `description` | `ReactNode` | – | Subtitle; may be function → JSX. |
| `closeButton` | `boolean` | `false` | Per-toast close. |
| `invert` | `boolean` | `false` | Per-toast invert. |
| `duration` | `number` | `4000` | Auto-close ms; `Infinity` persists. |
| `position` | `string` | `'bottom-right'` | Override placement. |
| `dismissible` | `boolean` | `true` | `false` blocks user dismiss. |
| `icon` | `ReactNode` | – | Leading icon; `null` hides default. |
| `action` | `ReactNode \| { label, onClick }` | – | Primary; closes unless `preventDefault`. |
| `cancel` | `ReactNode \| { label, onClick }` | – | Secondary; closes on click. |
| `actionButtonStyle` | `object` | `{}` | Action button inline styles. |
| `cancelButtonStyle` | `object` | `{}` | Cancel button inline styles. |
| `id` | `string` | – | Re-call with same id updates in place. |
| `testId` | `string` | – | `data-testid`. |
| `toasterId` | `string` | – | Target toaster `id`. |
| `style` | `object` | – | Inline toast styles. |
| `classNames` | `object` | – | `{ toast, title, description, actionButton, cancelButton, closeButton }` — needs `!important` unless `unstyled`. |
| `unstyled` | `boolean` | `false` | Strip default styles. |
| `onDismiss` | `(toast) => void` | – | Close button or swipe. |
| `onAutoClose` | `(toast) => void` | – | Timeout close. |
| `containerAriaLabel` | `string` | `'Notifications'` | Region label. |

### Functions

| API | Role |
| --- | --- |
| `toast(msg, opts?)` | Show; returns id. |
| `toast.success / .error / .info / .warning` | Typed variants. |
| `toast.loading` | Spinner; update via id. |
| `toast.promise(promise, { loading, success, error })` | Async lifecycle. |
| `toast.custom((t) => jsx, opts?)` | Headless content. |
| `toast.dismiss(id?)` | One or all. |
| `toast.getActiveToasts()` | Snapshot outside React. |
| `useSonner()` | `{ toasts }` hook. |
