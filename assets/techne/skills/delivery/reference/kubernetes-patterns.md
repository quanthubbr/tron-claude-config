# Kubernetes

## Production Deployment (checklist)

- `replicas: ≥2` for HA; `RollingUpdate` with `maxUnavailable: 0`, `maxSurge: 1`
- `image: registry/app:1.4.2` or `@sha256:…` — not `latest`
- Pod `securityContext`: `runAsNonRoot`, `fsGroup`; container: `readOnlyRootFilesystem`, drop `ALL` caps, `allowPrivilegeEscalation: false`
- `resources.requests` **and** `limits` on every container
- Probes: **startup** (slow boot), **liveness** (`/health`), **readiness** (`/ready` — deps OK)
- `envFrom` ConfigMap + `secretKeyRef` for secrets; mount `emptyDir` for `/tmp` when root FS read-only
- Dedicated `ServiceAccount`; `automountServiceAccountToken: false` unless the app calls K8s API (then narrow `Role` + `RoleBinding`)

## Probes (timing)

Startup: e.g. `failureThreshold: 30`, `periodSeconds: 5` → up to ~150s boot budget.

Liveness: longer period; restarts hung processes.

Readiness: removes pod from Service endpoints during transient dependency loss — do not point liveness at the same deep checks.

## Services and Ingress

`ClusterIP` internal; `LoadBalancer` when cloud exposes externally. Ingress: TLS via cert-manager annotation; force SSL redirect.

## ConfigMap vs Secret

ConfigMap for non-sensitive config. Secret values are base64 in etcd — prefer Sealed Secrets or External Secrets Operator in production. Never put passwords in ConfigMap data.

## Resources (rules of thumb)

| Workload | CPU req | Memory req |
|----------|---------|------------|
| Web API | 100–250m | 128–256Mi |
| Worker | 250–500m | 256–512Mi |
| JVM | 500m–1 | 512Mi–2Gi (+ headroom over heap) |

HPA (`autoscaling/v2`) needs requests set; target ~70% CPU / 80% memory utilization. PDB: `minAvailable: 2` or `maxUnavailable: 1` for critical tiers.

## RBAC

Default apps: SA with token automount **off**. Operators/controllers: minimal verbs on named resources (`resourceNames` on Secrets).

## Jobs

`restartPolicy: OnFailure` (not `Always`). `ttlSecondsAfterFinished` for cleanup. CronJob: `concurrencyPolicy: Forbid` for non-reentrant tasks.

## kubectl debug

```bash
kubectl describe pod <pod> -n ns
kubectl logs <pod> --previous
kubectl rollout undo deployment/app
kubectl apply -f deploy.yaml --dry-run=server
```

| Symptom | Likely cause |
|---------|----------------|
| CrashLoopBackOff | App exit — check `--previous` logs |
| ImagePullBackOff | Tag, pull secret, registry auth |
| Pending | Insufficient quota, selectors, taints |
| OOMKilled | Raise limit or fix leak |

## Anti-patterns

`:latest`; no resources; `cluster-admin` for app SA; plaintext secrets in ConfigMap; PDB with `minAvailable: 0`.

Related: **techne:delivery** deployment ref for CI → image → rollout; **exo-infra** for cluster provisioning.
