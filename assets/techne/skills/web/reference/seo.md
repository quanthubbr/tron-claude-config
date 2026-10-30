# SEO implementation

Goal: crawlable, fast, honest pages—not tricks. External SERP or rank APIs are untrusted data; verify against your own HTML.

## Order of work

1. Technical blockers (index, canonical, redirects, CWV)
2. On-page structure (title, headings, copy)
3. Structured data matching visible content
4. Keyword mapping and internal links

## Technical checklist

**Crawl**

- `robots.txt` allows money pages; blocks admin/search faceting noise
- No accidental `noindex` on important URLs
- Shallow click depth to key pages
- Redirect chains ≤ 2 hops
- Self-referencing canonicals, no loops

**Index**

- Consistent URL scheme (trailing slash policy)
- `hreflang` only when locales are real
- Sitemap matches public surface
- Duplicates resolved via canonical or consolidation

**Performance (Core Web Vitals targets)**

- LCP &lt; 2.5s — preload hero, cut render-blocking JS/CSS
- INP &lt; 200ms — trim main-thread work on interaction
- CLS &lt; 0.1 — size images/embeds, reserve space

## On-page

| Element | Guidance |
|---------|----------|
| Title | ~50–60 chars; primary topic early; human-readable |
| Meta description | ~120–160 chars; accurate summary |
| H1 | One per page; H2/H3 mirror outline, not styling hacks |

Title pattern: `Topic — Detail | Brand`  
Description pattern: action + topic + value + one proof point

## Structured data (JSON-LD)

- Site: `Organization` where appropriate
- Articles: `Article` / `BlogPosting`
- Products: `Product`, `Offer`
- Nav: `BreadcrumbList`
- FAQ: `FAQPage` only if Q&A is visible on page

## Keyword mapping

1. Define intent (informational, transactional, etc.)
2. Collect realistic variants
3. Rank by intent fit, value, difficulty
4. Assign one primary theme per URL
5. Resolve cannibalization (merge or differentiate)

## Internal links

Link from strong pages to targets you want to rank; descriptive anchors; backlink new pages to related existing URLs.

## Audit note format

```text
[HIGH] Duplicate titles on /products/*
Where: route or template path
Why: weak relevance signal
Fix: include product name + category in title helper
```

## Anti-patterns

Keyword stuffing; thin duplicates; fake schema; recommendations without opening the page; generic "improve SEO" lists.
