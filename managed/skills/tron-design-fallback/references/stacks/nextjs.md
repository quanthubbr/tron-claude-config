# Next.js — high-severity implementation guidelines

Subordinate to Emil + Impeccable + Taste. Implementation correctness only; never visual direction.

## Routing

- **Handle errors with error.tsx** — Do: error.tsx with reset function · Don't: try/catch in every component

## Rendering

- **Use Server Components by default** — Do: Keep components server by default · Don't: Add 'use client' unnecessarily
- **Mark Client Components explicitly** — Do: Add 'use client' only when needed · Don't: Server Component with hooks/events
- **Push Client Components down** — Do: Client wrapper for interactive parts only · Don't: Mark page as Client Component

## DataFetching

- **Fetch data in Server Components** — Do: async function Page() { const data = await fetch() } · Don't: useEffect for initial data
- **Configure caching explicitly (Next.js 15+)** — Do: Explicitly set cache: 'force-cache' for static data · Don't: Assume default is cached (it's not in Next.js 15)

## Images

- **Use next/image for optimization** — Do: <Image> component for all images · Don't: <img> tags directly
- **Provide width and height** — Do: width and height props or fill · Don't: Missing dimensions
- **Configure remote image domains** — Do: remotePatterns in next.config.js · Don't: Allow all domains

## API

- **Validate request body** — Do: Zod or similar for validation · Don't: Trust client input

## Middleware

- **Keep middleware edge-compatible** — Do: Edge-compatible code only · Don't: Node.js APIs in middleware

## Environment

- **Use NEXT_PUBLIC prefix** — Do: NEXT_PUBLIC_ for client vars · Don't: Server vars exposed to client
- **Validate env vars** — Do: Validate on startup · Don't: Undefined env at runtime
- **Use .env.local for secrets** — Do: .env.local gitignored · Don't: Secrets in .env committed

## Performance

- **Avoid layout shifts** — Do: Skeleton loaders aspect ratios · Don't: Content popping in

## Link

- **Use next/link for navigation** — Do: <Link href=""> for internal links · Don't: <a> for internal navigation

## Security

- **Sanitize user input** — Do: Escape sanitize validate all input · Don't: Direct interpolation of user data
- **Use CSP headers** — Do: Configure CSP in next.config.js · Don't: No security headers
- **Validate Server Action input** — Do: Validate and authorize in Server Action · Don't: Trust Server Action input
