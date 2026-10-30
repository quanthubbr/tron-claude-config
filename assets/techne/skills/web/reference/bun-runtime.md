# Bun runtime

All-in-one JS runtime: execute TS natively, install packages, bundle, and test (`bun:test` Jest-like API).

## When to choose

| Prefer Bun | Prefer Node |
|------------|-------------|
| Greenfield TS/JS, fast installs | Legacy tooling tied to Node |
| Single toolchain (run + test + build) | Dependency with known Bun incompat |
| Platform supports Bun runtime (e.g. Vercel Bun) | Maximum conservative compatibility |

## Daily commands

```bash
bun install
bun run dev
bun ./src/entry.ts
bun run --env-file=.env dev
bun test
bun test --watch
```

Migration: replace `node`/`npm`/`npx` with `bun` / `bun run` / `bun x`. Lockfile: commit `bun.lock` (text; older releases used binary `bun.lockb`).

## Test snippet

```typescript
import { expect, test } from 'bun:test'

test('sum', () => {
  expect(1 + 2).toBe(3)
})
```

## Runtime APIs (selected)

```typescript
const payload = await Bun.file('package.json').json()

Bun.serve({
  port: 3000,
  fetch(req) {
    return new Response('ok')
  },
})
```

## Deploy

- Install: `bun install --frozen-lockfile`
- Build: project script or `bun build ./src/index.ts --outdir=dist`
- Set platform runtime to Bun when supported

Keep dependencies current; Bun releases move quickly.
