# Vegas Casino Helm Chart

This Helm chart deploys the Vegas Casino microservices application to Kubernetes.

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- Podman or Docker for building images
- OpenTelemetry Collector (optional, for telemetry export)

## Installation

### Build Images

First, build all Docker images using Podman:

```bash
make docker-build-all
```

### Install the Chart

To install the chart with the release name `vegas-casino`:

```bash
helm install vegas-casino ./helm/vegas-casino \
  --namespace vegas-casino \
  --create-namespace
```

### Install with Custom Values

```bash
helm install vegas-casino ./helm/vegas-casino \
  --namespace vegas-casino \
  --create-namespace \
  --set global.imageTag=0.1 \
  --set opentelemetry.exporter.endpoint=http://otel-collector:4318
```

## Configuration

The following table lists the configurable parameters and their default values:

| Parameter | Description | Default |
|-----------|-------------|---------|
| `global.imageRegistry` | Image registry prefix (used as fallback) | `hrexed/vegasapp` |
| `global.imageTag` | Image tag (used as fallback) | `0.1` |
| `global.namespace` | Kubernetes namespace | `vegas-casino` |
| `global.createNamespace` | Create namespace (set to false to use existing) | `true` |
| `gateway.image.repository` | Gateway image repository (empty = global + "-gateway") | `""` |
| `gateway.image.tag` | Gateway image tag (empty = global.imageTag) | `""` |
| `frontend.image.repository` | Frontend image repository (empty = global + "-frontend") | `""` |
| `frontend.image.tag` | Frontend image tag (empty = global.imageTag) | `""` |
| `slots.image.repository` | Slots image repository (empty = global + "-slots") | `""` |
| `slots.image.tag` | Slots image tag (empty = global.imageTag) | `""` |
| `blackjack.image.repository` | Blackjack image repository (empty = global + "-blackjack") | `""` |
| `blackjack.image.tag` | Blackjack image tag (empty = global.imageTag) | `""` |
| `roulette.image.repository` | Roulette image repository (empty = global + "-roulette") | `""` |
| `roulette.image.tag` | Roulette image tag (empty = global.imageTag) | `""` |
| `dice.image.repository` | Dice image repository (empty = global + "-dice") | `""` |
| `dice.image.tag` | Dice image tag (empty = global.imageTag) | `""` |
| `opentelemetry.enabled` | Enable OpenTelemetry | `true` |
| `opentelemetry.exporter.endpoint` | OTLP exporter endpoint | `http://otel-collector:4318` |
| `gateway.enabled` | Enable gateway service | `true` |
| `gateway.replicaCount` | Gateway replicas | `2` |
| `frontend.enabled` | Enable frontend service | `true` |
| `frontend.replicaCount` | Frontend replicas | `2` |
| `slots.enabled` | Enable slots service | `true` |
| `slots.replicaCount` | Slots replicas | `2` |
| `blackjack.enabled` | Enable blackjack service | `true` |
| `blackjack.replicaCount` | Blackjack replicas | `2` |
| `roulette.enabled` | Enable roulette service | `true` |
| `roulette.replicaCount` | Roulette replicas | `2` |
| `dice.enabled` | Enable dice service | `true` |
| `dice.replicaCount` | Dice replicas | `2` |
| `ingress.enabled` | Enable traditional Ingress | `false` |
| `ingress.className` | Ingress class name | `nginx` |
| `gatewayAPI.enabled` | Enable Gateway API (modern alternative) | `true` |
| `gatewayAPI.gateway.className` | Gateway class name | `nginx` |
| `gatewayAPI.gateway.name` | Gateway resource name | `vegas-casino-gateway` |
| `serviceAccount.create` | Create a dedicated service account | `true` |
| `serviceAccount.name` | Service account name (empty = chart fullname) | `""` |
| `serviceAccount.annotations` | Service account annotations | `{}` |
| `serviceAccount.labels` | Additional service account labels | `{}` |
| `serviceAccount.automountServiceAccountToken` | Automount API credentials | `true` |

## Services

The chart deploys the following services:

- **Gateway** (Port 8080): API gateway and service orchestrator
- **Frontend** (Port 3000): Web frontend service
- **Slots** (Port 8081 HTTP, 50051 gRPC): Slots game service
- **Blackjack** (Port 8084 HTTP, 50054 gRPC): Blackjack game service
- **Roulette** (Port 8082 HTTP, 50052 gRPC): Roulette game service (Python)
- **Dice** (Port 8083 HTTP, 50053 gRPC): Dice game service (Go)

## Namespace Management

By default, the Helm chart creates a namespace for the application. If you want to use an existing namespace instead, set `global.createNamespace` to `false`:

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set global.createNamespace=false \
  --set global.namespace=my-existing-namespace
```

**Note**: When using an existing namespace, ensure the namespace exists before deploying the chart.

## OpenTelemetry

All services are configured with OpenTelemetry instrumentation using standard environment variables. The `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable is automatically set in all deployments:

- `OTEL_SERVICE_NAME`: Service name
- `OTEL_SERVICE_VERSION`: Service version
- `OTEL_RESOURCE_ATTRIBUTES`: Resource attributes (comma-separated key=value pairs)
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OTLP exporter endpoint (automatically set from `opentelemetry.exporter.endpoint` in values.yaml)
- `OTEL_EXPORTER_OTLP_PROTOCOL`: OTLP protocol (http/protobuf)

## Upgrading

To upgrade the release:

```bash
helm upgrade vegas-casino ./helm/vegas-casino \
  --namespace vegas-casino \
  --set global.imageTag=0.2
```

## Uninstalling

To uninstall/delete the release:

```bash
helm uninstall vegas-casino --namespace vegas-casino
```

## Ingress vs Gateway API

The chart supports two options for external access:

### Option 1: Traditional Ingress (Default: Disabled)

Use Kubernetes Ingress API with configurable ingress class:

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set ingress.enabled=true \
  --set gatewayAPI.enabled=false \
  --set ingress.className=nginx
```

### Option 2: Gateway API (Default: Enabled)

Use modern Kubernetes Gateway API with Gateway and HTTPRoute resources:

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set ingress.enabled=false \
  --set gatewayAPI.enabled=true \
  --set gatewayAPI.gateway.className=nginx
```

**Note:** Only one option should be enabled at a time. Gateway API requires Kubernetes 1.24+ and a Gateway API implementation (e.g., NGINX Gateway Fabric, Istio, etc.).

## Examples

### Deploy with custom image tag

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set global.imageTag=0.2
```

### Deploy with custom OpenTelemetry endpoint

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set opentelemetry.exporter.endpoint=http://dynatrace-otel-collector:4318
```

### Deploy with custom replica counts

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set gateway.replicaCount=3 \
  --set slots.replicaCount=3
```

### Deploy with traditional Ingress

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set ingress.enabled=true \
  --set gatewayAPI.enabled=false \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=vegas.example.com
```

### Deploy with Gateway API

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set ingress.enabled=false \
  --set gatewayAPI.enabled=true \
  --set gatewayAPI.gateway.className=nginx \
  --set gatewayAPI.gateway.listeners[0].hostname=vegas.example.com
```

### Deploy with Gateway API and TLS

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set ingress.enabled=false \
  --set gatewayAPI.enabled=true \
  --set gatewayAPI.gateway.className=nginx \
  --set gatewayAPI.gateway.listeners[1].hostname=vegas.example.com \
  --set gatewayAPI.gateway.listeners[1].tls.certificateRefs[0].name=vegas-casino-tls
```

### Deploy with custom images per service

```bash
# Custom image for slots service
helm install vegas-casino ./helm/vegas-casino \
  --set slots.image.repository=myregistry.io/slots \
  --set slots.image.tag=1.2.0

# Custom images for multiple services
helm install vegas-casino ./helm/vegas-casino \
  --set slots.image.repository=myregistry.io/slots \
  --set slots.image.tag=1.2.0 \
  --set blackjack.image.repository=myregistry.io/blackjack \
  --set blackjack.image.tag=1.3.0 \
  --set dice.image.repository=special-registry.io/dice \
  --set dice.image.tag=2.0.0
```

### Deploy with different image registry but same tag

```bash
helm install vegas-casino ./helm/vegas-casino \
  --set global.imageRegistry=myregistry.io/vegasapp \
  --set global.imageTag=0.2
```

### Deploy with mixed custom and default images

```bash
# Most services use global defaults, but dice uses custom image
helm install vegas-casino ./helm/vegas-casino \
  --set global.imageRegistry=myregistry.io/vegasapp \
  --set global.imageTag=0.2 \
  --set dice.image.repository=special-registry.io/dice \
  --set dice.image.tag=2.0.0
```

## Notes

- All services use OpenTelemetry for observability
- Images are built using Podman with platform `linux/amd64`
- Default image registry is `hrexed/vegasapp` with tag `0.1`
- Services are configured with health checks and resource limits
- The chart creates a ConfigMap with shared configuration values

