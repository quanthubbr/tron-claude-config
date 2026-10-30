# Vue 3 patterns

Composition API with `<script setup>`, Pinia, Vue Router. Nuxt-only bits marked; deep Nuxt SSR → **nuxt4-patterns** reference.

## Project layout (feature-first)

```
src/
  api/          composables/   components/{base,features}/
  pages/        router/        stores/        types/   utils/
```

Naming: `PascalCase.vue` components; `useThing.ts` composables; kebab-case feature folders.

## SFC structure

Script order: imports → props/emits → composables → refs → computed → methods → watchers → lifecycle → template → scoped style.

**Container** pages fetch and orchestrate; **presentational** children take props and emit events only.

### Props & emits

```typescript
interface Props {
  label: string
  variant?: 'primary' | 'secondary'
  items: Item[]
}
const props = withDefaults(defineProps<Props>(), { variant: 'primary' })

const emit = defineEmits<{
  submit: []
  'update:modelValue': [value: string]
}>()
```

Use `defineModel()` (3.4+) for two-way binding. Never mutate props.

## Composables

```typescript
export function useDebounced<T>(source: MaybeRef<T>, ms: number): Readonly<Ref<T>> {
  const out = ref(toValue(source)) as Ref<T>
  let timer: ReturnType<typeof setTimeout>
  watch(() => toValue(source), v => {
    clearTimeout(timer)
    timer = setTimeout(() => { out.value = v }, ms)
  })
  onUnmounted(() => clearTimeout(timer))
  return readonly(out)
}
```

Rules: `use*` prefix; reactive returns; cleanup; no module-scope side effects.

## State

| Layer | Tool |
|-------|------|
| Local | `ref` / `reactive` |
| Parent/child | props + emit |
| Cross-cutting config | provide/inject |
| App shared | Pinia setup store |
| Remote | composable + `$fetch` / TanStack Query |

Pinia setup example:

```typescript
export const useCartStore = defineStore('cart', () => {
  const lines = ref<Line[]>([])
  const busy = ref(false)
  const total = computed(() => lines.value.reduce((s, l) => s + l.price * l.qty, 0))

  async function add(sku: string) {
    busy.value = true
    try {
      const item = await fetchLine(sku)
      const hit = lines.value.find(l => l.id === item.id)
      if (hit) hit.qty++
      else lines.value.push({ ...item, qty: 1 })
    } finally {
      busy.value = false
    }
  }
  return { lines, busy, total, add }
})
```

## Router

Lazy `component: () => import('@/pages/Detail.vue')`, `props: true`, `meta` for auth guards.

When params change on same component instance:

```typescript
const route = useRoute()
const id = computed(() => route.params.id as string)
watch(id, next => load(next))
```

## Templates

- `v-if` / `v-else` for conditional mount; `v-show` for frequent toggle
- `@submit.prevent` on forms
- Multiple `v-model` bindings on custom inputs

## Performance

`v-memo`, `v-once`, `shallowRef` for large replaced blobs, `<KeepAlive :max="10">`, route-level code splitting, `<Suspense>` for async SFCs.

## Testing

Vitest + `@vue/test-utils` + `@pinia/testing`; Playwright for E2E (**techne:quality**).

```typescript
beforeEach(() => setActivePinia(createPinia()))

it('emits select', async () => {
  const w = mount(UserCard, { props: { user: { id: '1', name: 'Ada' } } })
  expect(w.text()).toContain('Ada')
  await w.find('button').trigger('click')
  expect(w.emitted('select')?.[0]).toEqual(['1'])
})
```

## Vue 3.5+ APIs

- Reactive props destructure from `defineProps` — watch via getter `watch(() => count, ...)`
- `useTemplateRef('input')` matches `ref="input"` in template
- `onWatcherCleanup()` inside watcher for abort controllers
- `useId()` for SSR-stable ids
- `<Teleport defer>` for same-tick targets
- Async SFC `hydrate: hydrateOnVisible()` for lazy hydration

## Nuxt basics (pointer)

Auto-imports composables; `useAsyncData` / `useFetch`; server routes under `server/api/`; `runtimeConfig` splits server vs `public` — details in **nuxt4-patterns**.

## Anti-patterns

| Bad | Fix |
|-----|-----|
| Destructure props (&lt;3.5) | `props.x` or `toRefs` |
| `v-if` + `v-for` same node | computed list |
| Index as `:key` | stable id |
| `v-html` on user input | sanitize or avoid |
| Mixins | composables |
| `reactive` for whole replacement | `ref` |
| Options API in greenfield | `<script setup>` |

Accessibility → **ui-design**.
