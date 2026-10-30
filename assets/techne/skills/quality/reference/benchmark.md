# Performance benchmarks

Establish baselines before large perf work, perf-sensitive PRs, launch gates, or “feels slow” reports. Store results in **`.benchmarks/*.json`** (git-tracked) so the team shares history.

## Mode A — Page (browser)

Use Chrome DevTools MCP or Playwright-driven navigation:

1. Open each target URL (cold cache when comparing).
2. Capture **Core Web Vitals** (typical budgets):
   - LCP &lt; 2.5s
   - INP &lt; 200ms
   - CLS &lt; 0.1
   - FCP &lt; 1.8s
   - TTFB &lt; 800ms
3. Sum transfer sizes: total page, JS (gzip target often &lt;200KB), CSS, images, third-party scripts.
4. Count requests; note render-blocking CSS/JS.

## Mode B — API

For each endpoint:

- Warmup, then **100** sequential samples → p50 / p95 / p99, payload size, status distribution.
- Optional: **10** concurrent clients for saturation signal.
- Compare to product SLA or prior baseline.

## Mode C — Dev loop

Time once per machine class (record env in JSON):

- Clean production build
- HMR after trivial edit
- Full unit test job
- `tsc --noEmit` or equivalent
- Lint
- Container image build (if applicable)

## Compare workflow

1. **baseline** — snapshot current metrics to `.benchmarks/<name>-baseline.json`.
2. Change code.
3. **compare** — rerun probes; emit delta table:

| Metric | Before | After | Δ | Note |
|--------|--------|-------|---|------|
| LCP | 1.1s | 1.3s | +200ms | warn |
| JS gzip | 170KB | 165KB | −5KB | ok |

Verdict labels: ok / warn / regress — use team thresholds when stricter than defaults.

## CI

Optional job on perf-tagged PRs: run compare against main baseline artifact; fail on agreed regressions (e.g. LCP +300ms or bundle +10%).

Pair with [browser-qa.md](browser-qa.md) for functional pre-ship checks; vitals overlap but benchmarks emphasize tracked numbers.
