# Picking UI & motion libraries

Explicit invocation only. Map **task → one recommendation** from the curated list. Check `package.json` first — prefer what is installed; flag churn if a competitor is already entrenched.

## Steps

1. Identify the **task** (dropdown → primitives), not the library user named.
2. Read existing dependencies.
3. Recommend **one** library, one-sentence why; wire/install if requested — no option menus when the list is clear.
4. Uncovered tasks: say you left the list; suggest from general knowledge.

## Curated list

### UI components & primitives

| Task | Library |
| --- | --- |
| Accessible unstyled primitives (dialog, popover, menu, select…) | [base-ui](https://base-ui.com) |
| Command palette (⌘K) | [cmdk](https://cmdk.paco.me) |
| Toasts | [Sonner](https://sonner.emilkowal.ski) — see [toasts.md](toasts.md) |
| OTP / verification input | [input-otp](https://input-otp.rodz.dev) |
| Debug/control GUI | [Leva](https://github.com/pmndrs/leva) — [dialkit](https://joshpuckett.me/dialkit) alternate |

### Motion & visuals

| Task | Library |
| --- | --- |
| Springs, layout, enter/exit, gestures | [motion](https://motion.dev) |
| Animated numbers | [NumberFlow](https://number-flow.barvian.me) |
| Animated text | [torph](https://torph.lochie.me/) |
| 3D globe | [Cobe](https://cobe.vercel.app) |
| Dynamic OG images | [Satori](https://github.com/vercel/satori) |
| Syntax highlighting | [shiki](https://shiki.style) |

Use Motion when springs/layout/exit/gesture needed — not for a lone CSS hover fade.

### Charts

| Task | Library |
| --- | --- |
| Live streaming series | [Liveline](https://github.com/benjitaylor/liveline) |
| General dashboards | [recharts](https://recharts.org) |

### Lists, drag, throughput

| Task | Library |
| --- | --- |
| Reorderable / draggable UI | [dnd kit](https://dndkit.com) |
| Virtualized long lists or tables | [Virtuoso](https://virtuoso.dev) |

### State & styling

| Task | Library |
| --- | --- |
| Client state | [zustand](https://zustand.docs.pmnd.rs) |
| Conditional class strings | [clsx](https://github.com/lukeed/clsx) |
| Typed Tailwind variants | [cva](https://cva.style) |
| Theme without flash | [next-themes](https://github.com/pacocoursey/next-themes) |

clsx for ad-hoc classes; cva when variants deserve a typed API — they compose.

## Common mismatches

- Hand-rolled toasts or modal-as-toast → Sonner
- Div dropdown without focus trap → base-ui
- Re-rendered number text → NumberFlow
- 1000+ DOM rows → Virtuoso
- Prop-drilled shared state web → zustand
- Deep ternary class strings → clsx/cva

For animation **implementation** after picking Motion or CSS, use [web.md](web.md) or [expo.md](expo.md).
