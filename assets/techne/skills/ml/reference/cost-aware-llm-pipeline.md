# Cost-aware LLM pipeline

Control API spend while preserving quality on hard tasks: route models by complexity, enforce budgets, retry narrowly, and cache stable prompt prefixes.

## When to use

- Apps calling Anthropic, OpenAI, or compatible APIs at scale
- Batch jobs where token volume dominates cost
- Multi-tier architectures (small model first, escalate on failure)

## Model tiering (no stale price tables)

1. **Classify each request** — input size, structured output need, reasoning depth, safety sensitivity, latency SLO.
2. **Map classes to provider tiers** — fast/cheap for extraction, formatting, routing, and simple Q&A; mid for most coding assistance; largest tier only for multi-step reasoning, long context synthesis, or high-stakes generation.
3. **Estimate spend from usage metadata** — use `input_tokens`, `output_tokens`, and cache read/write fields returned by the API; multiply by **current** list rates from the provider dashboard or pricing page at deploy time. Store rates in config/env refreshed on schedule, not copied into skills.
4. **Log routing decisions** — model id, tier reason, token counts, estimated USD — so thresholds can be tuned from production data.

Heuristic example (thresholds are project-specific, not universal):

```python
from dataclasses import dataclass

@dataclass(frozen=True)
class RoutePolicy:
    small_model: str
    large_model: str
    char_escalate: int = 10_000
    item_escalate: int = 30

def pick_model(policy: RoutePolicy, text_len: int, n_items: int, force: str | None = None) -> str:
    if force:
        return force
    if text_len >= policy.char_escalate or n_items >= policy.item_escalate:
        return policy.large_model
    return policy.small_model
```

## Immutable budget tracking

Never mutate running totals in place — append-only records simplify audit and replay.

```python
from dataclasses import dataclass

@dataclass(frozen=True, slots=True)
class UsageLine:
    model: str
    input_tokens: int
    output_tokens: int
    est_usd: float

@dataclass(frozen=True, slots=True)
class Ledger:
    cap_usd: float
    lines: tuple[UsageLine, ...] = ()

    def append(self, line: UsageLine) -> "Ledger":
        return Ledger(self.cap_usd, (*self.lines, line))

    @property
    def spent(self) -> float:
        return sum(x.est_usd for x in self.lines)

    @property
    def over_cap(self) -> bool:
        return self.spent > self.cap_usd
```

Compute `est_usd` with a small pricing function fed from config (updated when providers change rates).

## Retries

Retry **only** transient failures (connection, rate limit, 5xx). Fail immediately on auth, validation, and policy errors to avoid burning budget.

```python
RETRYABLE = (APIConnectionError, RateLimitError, InternalServerError)

def with_backoff(fn, attempts: int = 3):
    for i in range(attempts):
        try:
            return fn()
        except RETRYABLE:
            if i == attempts - 1:
                raise
            time.sleep(2 ** i)
```

## Prompt caching

When the provider supports ephemeral cache blocks, mark long static system instructions; keep variable user content outside the cached segment. Worth it when the stable prefix exceeds ~1k tokens and repeats across calls.

## Pipeline composition

```python
def invoke(user_text: str, policy: RoutePolicy, ledger: Ledger, price_fn) -> tuple[Result, Ledger]:
    model = pick_model(policy, len(user_text), estimate_items(user_text))
    if ledger.over_cap:
        raise BudgetError(ledger.spent, ledger.cap_usd)
    resp = with_backoff(lambda: client.messages.create(
        model=model,
        messages=build_messages(static_system, user_text, use_cache=True),
    ))
    line = UsageLine(
        model=model,
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        est_usd=price_fn(model, resp.usage),
    )
    return parse(resp), ledger.append(line)
```

## Agent model governance (house rule)

| Phase | Model tier |
|-------|----------------|
| Planning, research, eval design, docs, prompt critique | Economical |
| Production pipeline code, training scripts, inference paths | Robust |

Apply the same split when choosing a **judge model** vs the model under test — judges can often sit one tier lower if the rubric is structured.

## Practices

- Default to cheapest tier; escalate on measurable quality failure, not preemptively
- Set batch caps before loops; stop early on `over_cap`
- Centralize model ids in config
- Never retry 401/400-class errors

## Anti-patterns

- Largest model for every call
- Retry-all-errors policies
- Mutable global spend counters
- Hardcoded per-token constants in repo without refresh path
