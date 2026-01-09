# k8s/ Directory vs Helm Deployment Comparison

This document compares the `k8s/` directory manifests with the Helm chart deployment to help you understand the differences and choose the appropriate deployment method.

## Overview

| Aspect | k8s/ Directory | Helm Chart |
|--------|---------------|------------|
| **Purpose** | Direct Kubernetes manifests | Templated Helm charts |
| **Configuration** | Hardcoded values in YAML | Configurable via `values.yaml` |
| **Service Naming** | `vegas-{service}-service` | `vegas-casino-{service}` (configurable) |
| **Image Tags** | `latest` (hardcoded) | Configurable via `global.imageTag` |
| **Infrastructure** | Missing Redis, PostgreSQL | Includes Redis, PostgreSQL |
| **Feature Flags** | Not included | OpenFeature Operator integration |
| **Testing Tools** | Not included | k6 and Playwright deployments |

## Key Differences

### 1. Missing Infrastructure Components

The `k8s/` directory is **missing** the following components that are present in Helm:

#### Redis
- **Helm**: Includes `redis-deployment.yaml` and `redis-service.yaml`
- **k8s/**: ❌ Not present
- **Impact**: Frontend service cannot store user balances or profiles
- **Required for**: User balance management, profile storage

#### PostgreSQL
- **Helm**: Includes `postgresql-deployment.yaml` and `postgresql-service.yaml`
- **k8s/**: ❌ Not present
- **Impact**: Scoring service cannot persist game results
- **Required for**: Game statistics, leaderboards, dashboard data

#### OpenFeature Resources
- **Helm**: Includes `featureflag.yaml`, `featureflagsource.yaml`, `flagd-*.yaml`
- **k8s/**: ❌ Not present
- **Impact**: Feature flags will not work
- **Required for**: Dynamic feature toggling

#### Testing Tools
- **Helm**: Includes `k6-deployment.yaml` and `playwright-deployment.yaml`
- **k8s/**: ❌ Not present
- **Impact**: Cannot run load tests or E2E tests
- **Optional**: Testing infrastructure

### 2. Service Configuration Differences

#### Frontend Service

**k8s/ frontend-deployment.yaml**:
```yaml
# Missing Redis configuration
# Missing DASHBOARD_SERVICE_GRPC
# Uses old service names: vegas-slots-service:50051
# Missing SCORING_SERVICE_URL
```

**Helm frontend-deployment.yaml**:
```yaml
# Includes Redis configuration
- name: REDIS_HOST
  value: "vegas-casino-redis"
- name: REDIS_PORT
  value: "6379"
# Includes Dashboard gRPC
- name: DASHBOARD_SERVICE_GRPC
  value: "vegas-casino-dashboard:50055"
# Uses correct service names
- name: SLOTS_SERVICE_GRPC
  value: "vegas-casino-slots:50051"
```

#### Game Services

**k8s/ slots-deployment.yaml**:
```yaml
# Missing gRPC port exposure
ports:
  - containerPort: 8081  # HTTP only
# Missing Redis configuration
# Missing OpenFeature annotations
```

**Helm slots-deployment.yaml**:
```yaml
# Includes both HTTP and gRPC ports
ports:
  - containerPort: 8081  # HTTP
  - containerPort: 50051 # gRPC
# Includes Redis configuration
- name: REDIS_HOST
  value: "vegas-casino-redis"
# Includes OpenFeature annotations
annotations:
  openfeature.dev/enabled: "true"
```

### 3. Service Naming Convention

| Component | k8s/ Directory | Helm Chart |
|-----------|---------------|------------|
| Frontend | `vegas-frontend-service` | `vegas-casino-frontend` |
| Slots | `vegas-slots-service` | `vegas-casino-slots` |
| Roulette | `vegas-roulette-service` | `vegas-casino-roulette` |
| Dice | `vegas-dice-service` | `vegas-casino-dice` |
| Blackjack | `vegas-blackjack-service` | `vegas-casino-blackjack` |
| Dashboard | `vegas-dashboard-service` | `vegas-casino-dashboard` |
| Scoring | `vegas-scoring-service` | `vegas-casino-scoring` |

**Impact**: Services in `k8s/` use different DNS names, which may cause connectivity issues if services reference each other.

### 4. Image Configuration

**k8s/ Directory**:
```yaml
image: vegas-frontend-service:latest  # Hardcoded
```

**Helm Chart**:
```yaml
image: "{{ .Values.global.imageRegistry }}-frontend:{{ .Values.global.imageTag }}"
# Example: hrexed/vegasapp-frontend:0.39
```

**Impact**: k8s/ directory always uses `latest` tag, making version management difficult.

### 5. Missing Service Resources

The `k8s/` directory deployments include Service definitions inline, but they may be incomplete:

**k8s/ frontend-deployment.yaml** includes:
```yaml
---
apiVersion: v1
kind: Service
metadata:
  name: vegas-frontend-service
spec:
  ports:
  - port: 3000
    targetPort: 3000
```

**Helm** has separate service files with gRPC ports:
```yaml
# frontend-service.yaml
ports:
  - port: 3000
    name: http
  - port: 50055  # gRPC (if needed)
    name: grpc
```

### 6. OpenTelemetry Configuration

**k8s/ Directory**:
- Basic OpenTelemetry configuration
- Hardcoded endpoint: `http://otel-collector:4318`
- Missing protocol configuration

**Helm Chart**:
- Configurable OpenTelemetry endpoint
- Supports both gRPC and HTTP protocols
- Configurable via `values.yaml`

## Recommendations

### Use Helm Chart (Recommended)

✅ **Use Helm when**:
- You need a complete, production-ready deployment
- You want Redis and PostgreSQL included
- You need feature flags (OpenFeature)
- You want configurable image tags and registries
- You need testing tools (k6, Playwright)
- You want easy upgrades and rollbacks

### Use k8s/ Directory

⚠️ **Use k8s/ directory when**:
- You're doing quick testing or development
- You have external Redis/PostgreSQL
- You don't need feature flags
- You prefer direct kubectl apply
- You want minimal dependencies

### Migration Path

If you're currently using `k8s/` directory and want to migrate to Helm:

1. **Backup current deployment**:
   ```bash
   kubectl get all -n vegas-casino -o yaml > backup.yaml
   ```

2. **Install Helm chart**:
   ```bash
   helm install vegas-casino ./helm/vegas-casino
   ```

3. **Update service references** if you have external services pointing to old names

4. **Remove old k8s/ resources** (after verifying Helm deployment works)

## What Needs to be Updated in k8s/

If you want to keep using `k8s/` directory, you should:

1. **Add Redis deployment and service**
2. **Add PostgreSQL deployment and service**
3. **Update frontend deployment**:
   - Add Redis environment variables
   - Add DASHBOARD_SERVICE_GRPC
   - Update service names to match Helm convention
   - Add SCORING_SERVICE_URL
4. **Update game service deployments**:
   - Add gRPC port exposure
   - Add Redis environment variables
   - Update service names
5. **Add Service resources** for gRPC ports
6. **Update image tags** to use versioned tags instead of `latest`

## Current Status

**k8s/ Directory**: ⚠️ **Outdated** - Missing critical infrastructure and configuration

**Helm Chart**: ✅ **Current** - Reflects the latest architecture and requirements

---

**Recommendation**: Use the Helm chart for all deployments. The `k8s/` directory can be kept for reference or removed if no longer needed.
