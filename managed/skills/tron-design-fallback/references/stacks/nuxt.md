# Nuxt — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## Nuxt

### Routing

- **Define page metadata with definePageMeta** — Do: definePageMeta for layout middleware title · Don't: Manual route meta configuration

### Rendering

- **Use SSR by default** — Do: Keep ssr: true (default) · Don't: Disable SSR unnecessarily

### DataFetching

- **Use useFetch for simple data fetching** — Do: useFetch for API calls · Don't: $fetch in onMounted
- **Use $fetch for non-reactive requests** — Do: $fetch in event handlers or server routes · Don't: useFetch in click handlers
- **Handle loading and error states** — Do: Check status pending error refs · Don't: Ignoring loading states

### Lifecycle

- **Avoid side effects in script setup root** — Do: Side effects in onMounted · Don't: setInterval in root script setup
- **Use onMounted for DOM access** — Do: onMounted for DOM manipulation · Don't: Direct DOM access in setup

### Server

- **Use server/api for API routes** — Do: server/api/users.ts for /api/users · Don't: Manual Express setup
- **Use defineEventHandler for handlers** — Do: defineEventHandler for all handlers · Don't: export default function
- **Validate server input** — Do: Zod or similar for validation · Don't: Trust client input

### State

- **Use useState for shared reactive state** — Do: useState for cross-component state · Don't: ref for shared state

### SEO

- **Use useSeoMeta for SEO tags** — Do: useSeoMeta for meta tags · Don't: useHead for simple meta

### Middleware

- **Use defineNuxtRouteMiddleware** — Do: defineNuxtRouteMiddleware wrapper · Don't: export default function
- **Use navigateTo for redirects** — Do: return navigateTo('/login') · Don't: router.push in middleware

### ErrorHandling

- **Use createError for errors** — Do: createError with statusCode · Don't: throw new Error
- **Use short statusMessage** — Do: Short generic messages · Don't: Detailed error info in statusMessage

### Link

- **Use NuxtLink for internal navigation** — Do: <NuxtLink to> for internal links · Don't: <a href> for internal links

### Plugins

- **Use defineNuxtPlugin** — Do: defineNuxtPlugin wrapper · Don't: export default function

### Environment

- **Use runtimeConfig for env vars** — Do: runtimeConfig in nuxt.config · Don't: process.env directly
- **Use NUXT_ prefix for env override** — Do: NUXT_API_SECRET NUXT_PUBLIC_API_BASE · Don't: Custom env var names
- **Access public config with useRuntimeConfig** — Do: useRuntimeConfig().public · Don't: Direct process.env access
- **Keep secrets in private config** — Do: runtimeConfig.apiSecret (server only) · Don't: Secrets in public config

## Nuxt UI

### Installation

- **Add Nuxt UI module** — Do: pnpm add @nuxt/ui and add to modules · Don't: Manual component imports
- **Import Tailwind and Nuxt UI CSS** — Do: @import tailwindcss and @import @nuxt/ui · Don't: Skip CSS imports
- **Wrap app with UApp component** — Do: <UApp> wrapper in app.vue · Don't: Skip UApp wrapper
- **Do not manually add auto-registered modules** — Do: Configure via root-level keys in nuxt.config · Don't: Adding them to modules array causes duplicate registration

### Icons

- **Use i-{collection}-{name} format for icons** — Do: i-lucide-home i-heroicons-user format · Don't: lucide:home format (v3 syntax)

### Theming

- **Configure colors in app.config.ts** — Do: ui.colors.primary in app.config.ts · Don't: Hardcoded colors in components

### Forms

- **Use UForm with schema validation** — Do: :schema prop with validation schema · Don't: Manual form validation

### Overlays

- **Use useOverlay composable for programmatic overlays** — Do: overlay.create(Component).open({ props }) pattern · Don't: v3 overlay.open(Component) pattern (removed in v4)

### Tables

- **Use UTable with data and columns props** — Do: :data and :columns props · Don't: Manual table markup

### Feedback

- **Use useToast for notifications** — Do: useToast().add({ title description }) · Don't: Alert components for toasts

### Accessibility

- **Use UFormField for form accessibility** — Do: UFormField wraps inputs · Don't: Manual id and for attributes
