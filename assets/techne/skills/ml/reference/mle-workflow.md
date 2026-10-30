# ML engineering workflow

Production ML is software with stricter failure modes: leakage, train/serve skew, and silent slice regressions. Use only the lanes the project needs—batch scoring without a feature store is valid.

## When to use

- Classifiers, rankers, recommenders, forecasts, embeddings, anomaly detection, or LLM-augmented pipelines going beyond notebooks
- Model refresh, promotion criteria, shadow/canary rollout, or drift incidents
- Debugging stale features, label lag, artifact mismatch, or serving timeouts

## Related kit skills

| Need | Skill |
|------|--------|
| Python code & pytest | **techne:python** |
| APIs & batch jobs | **techne:services** |
| Postgres, ClickHouse, migrations | **techne:databases** |
| Deploy, containers | **techne:delivery** |
| Eval gates & TDD | **techne:quality**, this skill’s eval/regression refs |
| ADRs & onboarding | **techne:research** |

## Iteration compact (PR-sized)

Fill before heavy coding:

```text
Goal / who cares / decision owner:
Behavior changed by the model:
Primary metric & guardrails (latency, cost, calibration):
Mistake budget & unacceptable errors:
Assumptions & constraints:
Labels & data snapshot ID:
Baseline & candidate signals:
Eval slices & rollback:
Next experiment:
```

## Decision loop

1. Name the downstream **action**, not the model architecture.
2. State who pays for false positives vs false negatives vs latency vs compute.
3. Hypothesize separating signals; pick a simple baseline that must be beaten.
4. Score options with evidence; prefer the smallest change that cuts the top mistake class.
5. Record decision, counterargument, and next reversible step (**techne:research** ADR when irreversible).

## Metric economics

| Situation | Lean toward |
|-----------|-------------|
| Bad positive action is costly | Precision |
| Missed positives are costly | Recall |
| Ordering matters more than one threshold | AUC / NDCG |
| Balanced tradeoff with explainable F1 | F1 (explicitly justify) |

Always report confusion-matrix clusters, not headline accuracy alone. Treat delayed feedback as biased, lagged labels—not instant ground truth.

## Data & features

- Every feature family needs a **why it separates** story and a **leakage check** (event time, label availability).
- Handle imbalance via threshold, weights, or resampling—document the choice.
- Missing values: informative absence vs impute vs abstain.
- Add capacity only after error analysis shows baseline failure modes that new signal could fix.

## Error analysis loop

After each run or threshold change:

1. Bucket false positives, false negatives, abstentions, low-confidence, infra failures.
2. Cluster by language, cohort, source, freshness, sparsity, label source.
3. Route clusters to: better labels, features, threshold, or product fallback.
4. Capture each important cluster as an eval slice, regression test, or dashboard panel.

## Core pipeline stages

### 1. Prediction contract

- Entity, inputs, outputs (incl. confidence), batch vs online vs stream
- Fallback when model, features, or dependencies fail
- Human override path for high-impact decisions
- Retention and audit rules for inputs, predictions, labels

### 2. Data contract

- Primary key grain; label definition and **label time**
- Feature time and freshness SLA; point-in-time join rules
- Train/val/test/backtest splits (no random split on time-series without justification)
- Allowed nulls, ranges, enums; PII excluded from training artifacts

### 3. Reproducible training

- Frozen config (dataclass or typed YAML); pinned deps; seeds documented
- Log dataset version, code revision, config hash, metrics, artifact URI
- Preprocessing saved **with** the model; idempotent steps for retries
- Prefer pure transforms; avoid mutating shared frames in place

```python
import hashlib
from dataclasses import dataclass
from pathlib import Path

@dataclass(frozen=True)
class RunConfig:
    dataset_uri: str
    artifact_dir: Path
    seed: int
    lr: float
    batch_size: int

def run_tag(cfg: RunConfig, revision: str) -> str:
    payload = f"{cfg.dataset_uri}:{cfg.seed}:{cfg.lr}:{cfg.batch_size}"
    digest = hashlib.sha256(payload.encode()).hexdigest()[:12]
    return f"{revision[:12]}-{digest}"
```

### 4. Promotion

Declare gates **before** training completes. Example pattern:

```python
GATES = {
    "auc": ("min", 0.82),
    "calibration_error": ("max", 0.04),
    "p95_latency_ms": ("max", 80),
}

def require_gates(metrics: dict[str, float]) -> None:
    missing = [k for k in GATES if k not in metrics]
    if missing:
        raise ValueError(f"missing gate metrics: {missing}")
    bad = {
        k: metrics[k]
        for k, (op, bound) in GATES.items()
        if (op == "min" and metrics[k] < bound) or (op == "max" and metrics[k] > bound)
    }
    if bad:
        raise ValueError(f"promotion blocked: {bad}")
```

Offline gates are necessary, not sufficient—plan shadow, canary, or controlled A/B when behavior changes.

### 5. Serving

- Validate inputs (types, ranges, staleness); enforce timeouts and resource limits
- Log model version and correlation IDs; avoid PII in logs
- Integration tests: missing features, stale features, empty batch, fallback path

### 6. Operations

Track availability, errors, p50/p95 latency, feature null rates, distribution drift, confidence drift, label arrival health, business guardrails. Rollback = previous artifact + config + traffic switch—no retrain required.

## Observation ledger (per iteration)

```text
Change / why:
Metric & slice movement:
FP / FN themes:
Decision & tradeoff accepted:
Regression added:
Next step:
```

## Review checklist

- [ ] Prediction and data contracts documented
- [ ] Leakage reviewed for prediction-time availability
- [ ] Reproducible from config + data version + seed
- [ ] Baseline and production comparison with slices
- [ ] Gates automated; train/serve parity tested
- [ ] Monitoring and rollback defined

## Anti-patterns

- Notebook-only state required to reproduce
- Validation/test tuned repeatedly on the same holdout
- Training preprocessing diverges from serving
- Uptime-only monitoring without data or prediction quality
- Rollback requires full retrain
