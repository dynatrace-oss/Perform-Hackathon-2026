# Helm Deployment

## Overview

Helm is the recommended way to deploy the Vegas Casino application. It provides:

- ✅ Configuration management via values.yaml
- ✅ Template-based resource generation
- ✅ Dependency management
- ✅ Easy upgrades and rollbacks

## Prerequisites

1. **Helm 3.x** installed
2. **OpenFeature Operator** installed (see [OpenFeature Operator](openfeature.md))
3. **Gateway API** installed
4. **Docker images** built and available

## Quick Start

```bash
# Install with default values
helm install vegas-casino ./helm/vegas-casino

# Or with custom values
helm install vegas-casino ./helm/vegas-casino \
  --set global.imageTag=0.10 \
  --set frontend.replicaCount=2
```

## Configuration

### Key Values

Edit `helm/vegas-casino/values.yaml` or use `--set` flags:

```yaml
global:
  imageRegistry: hrexed/vegasapp
  imageTag: "0.10"
  namespace: vegas-casino

frontend:
  enabled: true
  replicaCount: 2

opentelemetry:
  enabled: true
  exporter:
    endpoint: "otel-collector.default.svc.cluster.local:4317"
    protocol: "grpc"

openfeature:
  enabled: true
```

### Custom Values File

Create `my-values.yaml`:

```yaml
global:
  imageTag: "0.11"

frontend:
  replicaCount: 3

playwright:
  enabled: true
  runContinuously: "true"

k6:
  enabled: true
  vus: "50"
  duration: "30m"
```

Deploy with custom values:
```bash
helm install vegas-casino ./helm/vegas-casino -f my-values.yaml
```

## Deployment Steps

### 1. Install OpenFeature Operator

**⚠️ CRITICAL**: Must be done first!

```bash
helm repo add openfeature https://open-feature.github.io/open-feature-operator
helm repo update
helm install open-feature-operator openfeature/open-feature-operator \
  --namespace open-feature-system \
  --create-namespace
```

### 2. Deploy Application

```bash
# Install
helm install vegas-casino ./helm/vegas-casino

# Or upgrade if already installed
helm upgrade vegas-casino ./helm/vegas-casino
```

### 3. Verify Deployment

```bash
# Check release status
helm status vegas-casino

# List all resources
helm get manifest vegas-casino

# Check pods
kubectl get pods -n vegas-casino
```

## Common Operations

### Upgrade Deployment

```bash
# Upgrade with new image tag
helm upgrade vegas-casino ./helm/vegas-casino \
  --set global.imageTag=0.11

# Upgrade with values file
helm upgrade vegas-casino ./helm/vegas-casino -f my-values.yaml
```

### Rollback

```bash
# List revisions
helm history vegas-casino

# Rollback to previous version
helm rollback vegas-casino

# Rollback to specific revision
helm rollback vegas-casino 2
```

### Uninstall

```bash
# Uninstall release
helm uninstall vegas-casino

# Note: This does NOT uninstall OpenFeature Operator
```

## Configuration Examples

### Enable All Services

```yaml
frontend:
  enabled: true
slots:
  enabled: true
roulette:
  enabled: true
dice:
  enabled: true
blackjack:
  enabled: true
scoring:
  enabled: true
dashboard:
  enabled: true
redis:
  enabled: true
postgresql:
  enabled: true
```

### Configure Resource Limits

```yaml
frontend:
  resources:
    requests:
      memory: "512Mi"
      cpu: "200m"
    limits:
      memory: "1Gi"
      cpu: "500m"
```

### Configure Feature Flags

```yaml
openfeature:
  enabled: true

flagd:
  slots:
    "progressive-jackpot":
      state: "ENABLED"
      defaultVariant: "true"
  roulette:
    "cheat-detection":
      state: "ENABLED"
      defaultVariant: "true"
```

### External Database

```yaml
postgresql:
  enabled: false  # Use external database

scoring:
  env:
    DB_HOST: "external-postgres.example.com"
    DB_PORT: "5432"
    DB_NAME: "vegas_casino"
    DB_USER: "vegas_user"
    DB_PASSWORD: "password"
```

## Troubleshooting

### Release Stuck

```bash
# Check release status
helm status vegas-casino

# Force delete (if needed)
helm uninstall vegas-casino --no-hooks
```

### Resources Not Created

```bash
# Check if values are correct
helm template vegas-casino ./helm/vegas-casino

# Dry-run to see what would be created
helm install vegas-casino ./helm/vegas-casino --dry-run --debug
```

### Image Pull Errors

```bash
# Verify image exists
docker pull hrexed/vegasapp-frontend:0.10

# Check image pull secrets
kubectl get secrets -n vegas-casino
```

---

**Next**: Learn about [Kubernetes Manifests](manifests.md) or [OpenFeature Operator](openfeature.md).




