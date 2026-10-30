# PyTorch patterns

Idiomatic training and inference: portable devices, reproducible seeds, explicit modes, and memory-aware loops. Confirm API details via **biblos** for your installed PyTorch major version.

## Principles

**Device-agnostic**

```python
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
net = Model().to(device)
batch_x = batch_x.to(device)
```

**Reproducibility** (document GPU nondeterminism)

```python
def seed_all(seed: int) -> None:
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    import numpy as np, random
    np.random.seed(seed)
    random.seed(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False
```

**Shapes** — comment tensor ranks in `forward`; verify after refactors.

## Module layout

Split feature blocks and heads; initialize weights explicitly; never allocate parameters inside `forward`.

```python
class ConvNet(nn.Module):
    def __init__(self, n_classes: int, drop: float = 0.5) -> None:
        super().__init__()
        self.backbone = nn.Sequential(
            nn.Conv2d(3, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=False),
            nn.MaxPool2d(2),
        )
        self.head = nn.Sequential(nn.Dropout(drop), nn.Linear(64 * 16 * 16, n_classes))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.backbone(x)
        return self.head(x.flatten(1))
```

## Training loop

```python
def train_epoch(
    net: nn.Module,
    loader: DataLoader,
    opt: torch.optim.Optimizer,
    loss_fn: nn.Module,
    device: torch.device,
    scaler: torch.amp.GradScaler | None = None,
) -> float:
    net.train()
    running = 0.0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        opt.zero_grad(set_to_none=True)
        with torch.amp.autocast("cuda", enabled=scaler is not None):
            logits = net(x)
            loss = loss_fn(logits, y)
        if scaler:
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            scaler.step(opt)
            scaler.update()
        else:
            loss.backward()
            nn.utils.clip_grad_norm_(net.parameters(), 1.0)
            opt.step()
        running += loss.item()
    return running / len(loader)
```

## Evaluation

```python
@torch.no_grad()
def eval_epoch(net, loader, loss_fn, device) -> tuple[float, float]:
    net.eval()
    total_loss, correct, n = 0.0, 0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        logits = net(x)
        total_loss += loss_fn(logits, y).item()
        correct += (logits.argmax(1) == y).sum().item()
        n += y.size(0)
    return total_loss / len(loader), correct / n
```

## Data loading

```python
loader = DataLoader(
    ds,
    batch_size=32,
    shuffle=True,
    num_workers=4,
    pin_memory=True,
    persistent_workers=True,
    drop_last=True,
)
```

Variable-length batches: pad in `collate_fn` with `nn.utils.rnn.pad_sequence`.

## Checkpoints

Save full training state when resuming; load on CPU with safe weights:

```python
def persist(path: str, net, opt, epoch: int, loss: float) -> None:
    torch.save(
        {"epoch": epoch, "net": net.state_dict(), "opt": opt.state_dict(), "loss": loss},
        path,
    )

def restore(path: str, net, opt=None) -> dict:
    blob = torch.load(path, map_location="cpu", weights_only=True)
    net.load_state_dict(blob["net"])
    if opt and "opt" in blob:
        opt.load_state_dict(blob["opt"])
    return blob
```

Prefer `state_dict` over pickling whole modules.

## Performance knobs

| Technique | When |
|-----------|------|
| `torch.amp.autocast` + `GradScaler` | GPU training throughput |
| `torch.utils.checkpoint.checkpoint` | OOM on large models |
| `torch.compile(net, mode="reduce-overhead")` | PyTorch 2+ stable graphs |
| `pin_memory=True` | Host→device copies |

Profile with `torch.profiler`; inspect VRAM via `torch.cuda.memory_summary()`.

## Idiom quick reference

| Practice | Reason |
|----------|--------|
| `net.train()` / `net.eval()` | Dropout & BatchNorm behavior |
| `torch.no_grad()` | Inference / metrics |
| `zero_grad(set_to_none=True)` | Less alloc on large models |
| Avoid inplace ops on tensors needing grad | Broken autograd |
| `.item()` only for logging after `backward` | Keeps graph intact |
| Move model once before epoch loop | Avoid per-step `.cuda()` |

## Anti-patterns

- Validation while `train()` mode active
- `torch.save(net, path)` portability trap
- Hardcoded `.cuda()` without fallback
- Creating weights inside `forward` each call
