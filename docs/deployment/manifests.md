# Kubernetes Manifests

## Overview

You can deploy the Vegas Casino application using raw Kubernetes manifests instead of Helm. This gives you full control over the resources but requires manual management.

## Prerequisites

1. **kubectl** configured
2. **OpenFeature Operator** installed (see [OpenFeature Operator](openfeature.md))
3. **Gateway API** installed
4. **Docker images** built and available

## Deployment Order

### 1. Install OpenFeature Operator (REQUIRED FIRST!)

**⚠️ IMPORTANT**: Must be installed before application deployment.

```bash
helm repo add openfeature https://open-feature.github.io/open-feature-operator
helm install open-feature-operator openfeature/open-feature-operator \
  --namespace open-feature-system \
  --create-namespace
```

### 2. Create Namespace

```bash
kubectl create namespace vegas-casino
```

### 3. Deploy Resources

Deploy in this order:

```bash
# 1. ConfigMaps and Secrets
kubectl apply -f helm/vegas-casino/templates/configmap.yaml
kubectl apply -f helm/vegas-casino/templates/secret.yaml

# 2. Feature Flags (requires OpenFeature Operator)
kubectl apply -f helm/vegas-casino/templates/featureflag.yaml
kubectl apply -f helm/vegas-casino/templates/featureflagsource.yaml

# 3. Database (if enabled)
kubectl apply -f helm/vegas-casino/templates/postgresql-deployment.yaml
kubectl apply -f helm/vegas-casino/templates/postgresql-service.yaml

# 4. Redis (if enabled)
kubectl apply -f helm/vegas-casino/templates/redis-deployment.yaml
kubectl apply -f helm/vegas-casino/templates/redis-service.yaml

# 5. Application Services
kubectl apply -f helm/vegas-casino/templates/frontend-deployment.yaml
kubectl apply -f helm/vegas-casino/templates/frontend-service.yaml
kubectl apply -f helm/vegas-casino/templates/slots-deployment.yaml
kubectl apply -f helm/vegas-casino/templates/slots-service.yaml
# ... repeat for other services

# 6. Gateway API
kubectl apply -f helm/vegas-casino/templates/gateway.yaml
kubectl apply -f helm/vegas-casino/templates/httproute.yaml
```

## Using Helm Template

Instead of manually applying, you can use Helm to generate manifests:

```bash
# Generate all manifests
helm template vegas-casino ./helm/vegas-casino > manifests.yaml

# Apply generated manifests
kubectl apply -f manifests.yaml
```

## Customizing Manifests

### Edit Generated Manifests

```bash
# Generate manifests
helm template vegas-casino ./helm/vegas-casino > manifests.yaml

# Edit manifests.yaml
vim manifests.yaml

# Apply
kubectl apply -f manifests.yaml
```

### Manual Manifest Creation

Create custom manifests based on templates:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: vegas-casino-frontend
  namespace: vegas-casino
spec:
  replicas: 2
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: hrexed/vegasapp-frontend:0.10
        ports:
        - containerPort: 3000
        env:
        - name: CASINO_URL
          value: "http://vegas-casino-frontend:3000"
```

## Verification

```bash
# Check all resources
kubectl get all -n vegas-casino

# Check deployments
kubectl get deployments -n vegas-casino

# Check services
kubectl get services -n vegas-casino

# Check pods
kubectl get pods -n vegas-casino

# Check logs
kubectl logs -n vegas-casino deployment/vegas-casino-frontend
```

## Updating Manifests

### Update Image

```bash
# Set new image
kubectl set image deployment/vegas-casino-frontend \
  frontend=hrexed/vegasapp-frontend:0.11 \
  -n vegas-casino

# Or edit deployment
kubectl edit deployment vegas-casino-frontend -n vegas-casino
```

### Scale Services

```bash
# Scale frontend
kubectl scale deployment vegas-casino-frontend --replicas=3 -n vegas-casino
```

### Update Environment Variables

```bash
# Set env var
kubectl set env deployment/vegas-casino-frontend \
  OTEL_EXPORTER_OTLP_ENDPOINT=otel-collector:4317 \
  -n vegas-casino
```

## Cleanup

```bash
# Delete all resources
kubectl delete namespace vegas-casino

# Or delete individual resources
kubectl delete deployment vegas-casino-frontend -n vegas-casino
kubectl delete service vegas-casino-frontend -n vegas-casino
```

## Advantages of Manifests

- ✅ Full control over resources
- ✅ No Helm dependency
- ✅ Easy to version control
- ✅ Direct kubectl operations

## Disadvantages

- ❌ Manual configuration management
- ❌ No templating
- ❌ Harder to maintain
- ❌ No rollback support

---

**Next**: Learn about [OpenFeature Operator](openfeature.md) or return to [Deployment Overview](index.md).




