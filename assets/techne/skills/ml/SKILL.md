---
name: ml
description: Production ML and LLM systems—data contracts, PyTorch training, eval gates, prompt design, cost-aware API routing, and agent regression tests. Use for model promotion, train/serve parity, drift, embeddings, classifiers, forecasting, or LLM spend control.
---

End-to-end machine learning engineering: turn notebook experiments into reproducible pipelines with measurable promotion gates, monitored serving, and LLM cost guardrails. Pair **techne:python** for implementation, **techne:databases** for labels and feature stores, **techne:services** for inference APIs, **techne:quality** for automated tests, **exo-data-ai** for deep implementation, **atlas** for code structure, and **biblos** for library APIs.

## Non-negotiable rules

1. **Write the prediction contract first** — target, decision owner, output schema, latency budget, fallback when features or the model are unavailable.
2. **Lock the data contract** — entity grain, label timestamp, feature freshness, split policy, snapshot ID; reject features not knowable at prediction time.
3. **Compare against baseline and current production** before treating offline gains as real; slice metrics for high-risk cohorts.
4. **Automate promotion gates and fail closed** — declare thresholds before training finishes; missing metrics block release.
5. **Share or equivalence-test train vs serve transforms** — never copy preprocessing manually into serving without a parity test.
6. **Package artifacts with version, config hash, dataset reference, and preprocessing** — safe deserialization; no secrets or PII in artifacts or prediction logs.
7. **PyTorch: device-agnostic code, explicit seeds, `train()`/`eval()` before loops, `weights_only=True` on load** — profile before optimizing memory.
8. **LLM calls: route by task complexity to the cheapest tier that meets quality** — set batch budgets up front; retry only transient errors; cache stable system prompts when the provider supports it. **Check current provider pricing** when estimating cost; do not rely on stale per-token tables in docs.
9. **Model tier for agents: economical models for planning, research, review, and docs; robust models for production training, inference, and pipeline code** — same split applies to LLM judge vs implementation work.
10. **Define evals before building** — capability vs regression; prefer deterministic code graders; target pass@3 ≥ 0.90 for new capability, pass^3 = 1.00 for release-critical regression paths.
11. **Do not trust agent self-review on agent-written changes** — run automated tests and build first; add a regression case for every production bug (especially dual-path sandbox vs live logic).
12. **Monitor system health and model quality** — latency, feature drift, prediction drift, delayed labels; every deploy names rollback artifact and trigger.
13. **Scope to the system** — skip feature stores, GPUs, or online serving if a contract, a baseline, an eval script and a rollback plan already cover the need.
14. **Security and privacy** — run **security-review** / **exo-security** on datasets, prompts, and deserialization paths; session continuity via **/session-handoff**, not legacy save/resume commands.

## References

| File | Load when |
|------|-----------|
| [reference/mle-workflow.md](reference/mle-workflow.md) | Contracts, reproducible pipelines, promotion, serving, monitoring, error analysis |
| [reference/pytorch-patterns.md](reference/pytorch-patterns.md) | Modules, training/eval loops, DataLoader, AMP, checkpoints, perf |
| [reference/cost-aware-llm-pipeline.md](reference/cost-aware-llm-pipeline.md) | Model routing, budgets, retries, prompt caching, spend estimation |
| [reference/eval-harness.md](reference/eval-harness.md) | Eval-driven development, graders, pass@k / pass^k, eval artifacts |
| [reference/prompt-optimizer.md](reference/prompt-optimizer.md) | Rewriting user prompts for agents (advisory only—does not execute the task) |
| [reference/ai-regression-testing.md](reference/ai-regression-testing.md) | Agent blind spots, sandbox API tests, bug-driven regression suite |
