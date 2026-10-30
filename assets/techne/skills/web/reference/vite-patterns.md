# Vite toolchain

Vite 8+ dev serves native ESM on demand; production bundles via Rolldown (or Rollup on older majors) with Oxc minify by default. Deps pre-bundled to ESM under `node_modules/.vite`.

## Config essentials

```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), ['VITE_'])
  return {
    plugins: [react()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: command === 'serve' ? { port: 3000 } : undefined,
    define: { __API_URL__: JSON.stringify(env.VITE_API_URL) },
  }
})
```

| Option | Notes |
|--------|--------|
| `envPrefix` | Default `VITE_`; only prefixed vars reach `import.meta.env` |
| `build.minify` | `'oxc'` default; avoid deprecated esbuild minify |
| `build.sourcemap` | Keep `false` in prod unless uploading to error tracker |

## Plugins (typical)

| Plugin | Use |
|--------|-----|
| `@vitejs/plugin-react-swc` | Default React |
| `@vitejs/plugin-vue` | Vue SFCs |
| `vite-plugin-checker` | Typecheck + lint overlay (fills build gap) |
| `vite-tsconfig-paths` | Mirror `tsconfig` paths |
| `vite-plugin-dts` | Library `.d.ts` emit |
| `rollup-plugin-visualizer` | Bundle audits (`enforce: 'post'`) |

Custom plugins: unique `name`, optional `enforce`, `transform` / `resolveId`+`load`, `configureServer`. Virtual modules use `\0` prefix.

## Environment & security

- `.env`, `.env.local`, `.env.[mode]`, `.env.[mode].local` — later wins; `*.local` gitignored.
- Client: `import.meta.env.VITE_*`, `MODE`, `DEV`, `PROD`, `BASE_URL`.
- **`VITE_` is not encryption** — anything prefixed ships in JS; API keys belong on server.
- `loadEnv(mode, root, ['VITE_'])` — never empty prefix array that loads all vars.

## Dev server

```typescript
server: {
  host: true, // containers / LAN
  proxy: {
    '/api': { target: 'http://localhost:8080', changeOrigin: true, rewrite: p => p.replace(/^\/api/, '') },
  },
  warmup: { clientFiles: ['./src/main.tsx'] },
  fs: { allow: ['..'] }, // monorepo packages outside root
}
```

WebSocket proxy: `ws: true`.

## Build

Manual chunks (object form for vendors):

```typescript
build: {
  rolldownOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom'],
      },
    },
  },
}
```

Library mode: `build.lib` + **externalize every peer** in `rolldownOptions.external`; emit types separately.

SSR tweaks: `ssr.external` vs `ssr.noExternal` for CJS/ESM mismatches.

## optimizeDeps

Force-include stubborn CJS packages; `exclude` only valid ESM; `force: true` when debugging stale cache.

## Pitfalls

- Dev transform pipeline ≠ prod bundle — always `build && preview`.
- Stale hashed chunks after deploy — retain old assets briefly or reload on dynamic import failure.
- Barrel imports and extensionless imports slow dev — import concrete files with extensions where policy allows.
- `vite preview` ≠ production hosting.
- `@vitejs/plugin-legacy` — large cost; enable only with analytics proof.
- HMR: mutate `import.meta.hot.data` fields, do not reassign `.data` object.

Profile slow dev: `vite --profile` → Speedscope.
