# Technology Stack

## Programming Languages

### Node.js Services
- **Frontend Service**: Express.js web framework
- **Slots Service**: Node.js with gRPC
- **Blackjack Service**: Node.js with gRPC
- **Dashboard Service**: Express.js API server
- **Version**: Node.js 18+

### Python Services
- **Roulette Service**: Python 3.11+ with Flask
- **gRPC**: grpcio and grpcio-tools
- **Dependencies**: requirements.txt

### Go Services
- **Dice Service**: Go 1.21+
- **gRPC**: google.golang.org/grpc
- **Modules**: go.mod/go.sum

### Java Services
- **Scoring Service**: Java 17 with Spring Boot 3.2.0
- **Build Tool**: Maven
- **Framework**: Spring Data JPA

## Observability Technologies

### OpenTelemetry
- **Version**: 1.31.0 (Java), Latest (Node.js/Python/Go)
- **Protocol**: gRPC (OTLP)
- **Exporters**: 
  - `@opentelemetry/exporter-otlp-grpc` (Node.js)
  - `opentelemetry-exporter-otlp-proto-grpc` (Python)
  - `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc` (Go)
  - `opentelemetry-exporter-otlp` (Java)
- **Instrumentation**: Auto-instrumentation for HTTP, Express, gRPC, Fetch

### OpenTelemetry Collector
- **Endpoint**: `otel-collector.default.svc.cluster.local:4317`
- **Protocol**: gRPC
- **Purpose**: Receives and forwards telemetry data

## Feature Flag Technologies

### OpenFeature
- **SDK**: `@openfeature/server-sdk` (Node.js)
- **Provider**: `@openfeature/flagd-provider`
- **Operator**: OpenFeature Operator (Kubernetes)

### flagd
- **Version**: Latest (via OpenFeature Operator)
- **Port**: 8014 (gRPC), 8015 (Management)
- **Protocol**: gRPC
- **Configuration**: Kubernetes CRDs

## Data Storage

### Redis
- **Purpose**: Game state, session cache, balance cache
- **Client Libraries**:
  - Node.js: `redis` package
  - Python: `redis-py`
  - Go: `github.com/redis/go-redis/v9`
- **Port**: 6379

### PostgreSQL
- **Purpose**: Persistent game results and scores
- **Driver**: 
  - Java: `org.postgresql:postgresql`
  - Spring Data JPA for ORM
- **Port**: 5432
- **Schema**: Managed by Hibernate DDL

## Container & Orchestration

### Docker
- **Base Images**:
  - Node.js: `node:18-alpine`
  - Python: `python:3.11-slim`
  - Go: `golang:1.21-alpine`
  - Java: `eclipse-temurin:17-jre-alpine`
  - Playwright: `mcr.microsoft.com/playwright:v1.40.0-focal`
  - k6: `grafana/k6:latest`

### Kubernetes
- **API Version**: v1
- **Resources**: Deployments, Services, Jobs, ConfigMaps, Secrets
- **Gateway API**: For ingress routing

### Helm
- **Version**: 3.x
- **Chart**: `vegas-casino`
- **Dependencies**: None (OpenFeature Operator installed separately)

## Build Tools

### Make
- **Purpose**: Build automation
- **Targets**: Docker build, push, testing
- **Builder**: Podman or Docker

### Maven
- **Purpose**: Java/Spring Boot builds
- **Version**: 3.x
- **Configuration**: pom.xml

### npm/yarn
- **Purpose**: Node.js dependency management
- **Files**: package.json

### pip
- **Purpose**: Python dependency management
- **Files**: requirements.txt

### go mod
- **Purpose**: Go dependency management
- **Files**: go.mod, go.sum

## Testing Tools

### Playwright
- **Version**: 1.40.0
- **Purpose**: Browser automation and E2E testing
- **Browsers**: Chromium (headless)

### k6
- **Version**: Latest
- **Purpose**: Load and performance testing
- **Metrics**: Built-in + custom metrics

## Development Tools

### Protocol Buffers
- **Purpose**: gRPC service definitions
- **Compiler**: protoc
- **Languages**: Go, Python, Node.js

### Git
- **Version Control**: Git
- **Workflow**: Feature branches

---

**Next**: Learn how to [Build the Project](../development/building.md) or explore [Testing](../testing/index.md).

