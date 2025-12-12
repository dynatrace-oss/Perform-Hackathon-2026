# 🎰 Vegas Casino - Observability Hackathon Project

A comprehensive microservices-based casino application designed for **observability hackathons** where attendees improve instrumentation, observability pipelines, and feature flag management.

> 📚 **Full Documentation**: Serve the [MkDocs website](docs/index.md) locally with `make docs-serve` or build it with `make docs-build` for complete documentation, architecture details, and deployment guides.

## 🎮 Games Available

The Vegas Casino features four different games, each implemented in different programming languages:

### 🎰 Slots (Node.js)
- **Port**: 8081 (HTTP), 50051 (gRPC)
- **Features**: Progressive jackpot, bonus rounds, cheat detection
- **Technology**: Node.js/Express with gRPC support

### 🔴 Roulette (Python)
- **Port**: 8082 (HTTP), 50052 (gRPC)
- **Features**: European roulette, multiple bet types, live wheel simulation, cheat codes
- **Technology**: Python/Flask with gRPC support

### 🎲 Dice (Go)
- **Port**: 8083 (HTTP), 50053 (gRPC)
- **Features**: Craps-style dice game, pass-line and come bets
- **Technology**: Go with gRPC support

### 🃏 Blackjack (Node.js)
- **Port**: 8084 (HTTP), 50054 (gRPC)
- **Features**: Traditional blackjack, double down, insurance, surrender options
- **Technology**: Node.js/Express with gRPC support

## 🚩 Feature Flags

The application uses **OpenFeature** with **flagd** for feature flag management. Feature flags are configured per game and can be toggled dynamically without redeploying services.

### Slots Feature Flags
- **`slots.progressive-jackpot`**: Enable/disable progressive jackpot functionality
- **`slots.bonus-rounds`**: Enable/disable bonus round features
- **`slots.cheat-detection`**: Enable/disable cheat detection system

### Roulette Feature Flags
- **`roulette.multiple-bets`**: Allow multiple simultaneous bets
- **`roulette.live-wheel`**: Enable live wheel animation
- **`roulette.cheat-detection`**: Enable cheat codes (ball control, wheel bias, etc.)

### Blackjack Feature Flags
- **`blackjack.double-down`**: Enable double down option
- **`blackjack.insurance`**: Enable insurance bets
- **`blackjack.surrender`**: Enable surrender option

### Dice Feature Flags
- **`dice.pass-line`**: Enable pass-line bets
- **`dice.come-bets`**: Enable come bets

All feature flags are managed via Kubernetes Custom Resources (`FeatureFlag` and `FeatureFlagSource`) and automatically injected via the OpenFeature Operator.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Frontend Service                       │
│                    (Node.js/Express)                       │
│                  Port: 3000 (HTTP)                         │
│              Browser-side OpenTelemetry                    │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├──────────────────────────────────────┐
               │                                      │
               ▼                                      ▼
    ┌──────────────────┐                  ┌──────────────────┐
    │  Game Services   │                  │  Dashboard Service│
    │                  │                  │  (Node.js)       │
    │  • Slots (Node)  │                  │  Port: 3001      │
    │  • Roulette (Py)│                  └────────┬──────────┘
    │  • Dice (Go)     │                           │
    │  • Blackjack (N) │                           │
    │                  │                           │
    │  + flagd sidecar │                           │
    │  + OpenTelemetry │                           │
    └────────┬─────────┘                           │
             │                                     │
             │                                     │
             ▼                                     ▼
    ┌──────────────────┐                  ┌──────────────────┐
    │   Redis Cache    │                  │ Scoring Service  │
    │   (State Store)  │                  │  (Java/Spring)   │
    │   Port: 6379     │                  │  Port: 8085      │
    └──────────────────┘                  └────────┬──────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │   PostgreSQL      │
                                          │   (Database)      │
                                          │   Port: 5432      │
                                          └──────────────────┘
```

### Key Components

- **Frontend Service**: Web UI, user management, game selection
- **Game Services**: Four independent microservices (Slots, Roulette, Dice, Blackjack)
- **Scoring Service**: Leaderboards, game statistics, score tracking
- **Dashboard Service**: Analytics and reporting dashboard
- **Redis**: Game state storage and session management
- **PostgreSQL**: Persistent storage for scores and game results
- **OpenTelemetry Collector**: Receives and exports telemetry data
- **OpenFeature Operator**: Manages flagd sidecar injection

### Communication Patterns

- **gRPC**: Primary communication between frontend and game services
- **HTTP**: RESTful APIs for dashboard, scoring, and fallback communication
- **Redis**: State management and caching
- **PostgreSQL**: Persistent data storage

## 🛠️ Building the Project

The project uses **Make** for build automation. All Docker images can be built individually or all at once.

### Prerequisites

- **Docker** or **Podman** installed
- **Make** installed
- **Access to container registry** (optional, for pushing images)

### Build Configuration

Configure build settings in the Makefile or via environment variables:

```bash
export REGISTRY=hrexed/vegasapp
export IMAGE_TAG=0.11
export BUILDER=podman  # or docker
```

### Build Individual Services

```bash
# Build frontend
make docker-build-frontend

# Build game services
make docker-build-slots
make docker-build-roulette
make docker-build-dice
make docker-build-blackjack

# Build supporting services
make docker-build-scoring
make docker-build-dashboard

# Build testing tools
make docker-build-playwright
make docker-build-k6
```

### Build All Services

```bash
make docker-build-all
```

This builds images for:
- Frontend
- Slots, Roulette, Dice, Blackjack
- Scoring
- Dashboard
- Playwright
- k6

### Push Images

```bash
# Push all images
make docker-push-all

# Or push individual images
make docker-push-frontend
make docker-push-slots
# ... etc
```

### Image Naming

Images follow the pattern: `{REGISTRY}-{service}:{IMAGE_TAG}`

Example: `hrexed/vegasapp-frontend:0.11`

## 🚀 Deployment with Helm

The application is deployed to Kubernetes using **Helm charts**. The deployment includes all services, databases, and supporting infrastructure.

### Prerequisites

Before deploying, ensure you have:

- ✅ **Kubernetes cluster** (v1.24+)
- ✅ **kubectl** configured
- ✅ **Helm 3.x** installed
- ✅ **OpenFeature Operator** installed (⚠️ **REQUIRED FIRST!**)
- ✅ **Gateway API** installed (for ingress)
- ✅ **Docker images** built and pushed to registry

### Step 1: Install OpenFeature Operator

**⚠️ CRITICAL**: The OpenFeature Operator **must be installed BEFORE** deploying the application.

```bash
# Add Helm repository
helm repo add openfeature https://open-feature.github.io/open-feature-operator
helm repo update

# Install operator
helm install open-feature-operator openfeature/open-feature-operator \
  --namespace open-feature-system \
  --create-namespace \
  --wait

# Verify installation
kubectl get pods -n open-feature-system
```

### Step 2: Install Gateway API (if not already installed)

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.0.0/standard-install.yaml
```

### Step 3: Deploy Application

```bash
# Install with default values
helm install vegas-casino ./helm/vegas-casino

# Or with custom configuration
helm install vegas-casino ./helm/vegas-casino \
  --set global.imageTag=0.11 \
  --set frontend.replicaCount=2 \
  --set k6.enabled=true \
  --set playwright.enabled=true
```

### Step 4: Verify Deployment

```bash
# Check all resources
kubectl get all -n vegas-casino

# Check pods
kubectl get pods -n vegas-casino

# Check services
kubectl get svc -n vegas-casino

# Check Gateway
kubectl get gateway -n vegas-casino
kubectl get httproute -n vegas-casino
```

### Accessing the Application

```bash
# Get external IP
kubectl get gateway vegas-casino-gateway -n vegas-casino \
  -o jsonpath='{.status.addresses[0].value}'

# Access frontend
curl http://<EXTERNAL_IP>/

# Access dashboard
curl http://<EXTERNAL_IP>/dashboard
```

### Configuration

Edit `helm/vegas-casino/values.yaml` or use `--set` flags:

```yaml
global:
  imageRegistry: hrexed/vegasapp
  imageTag: "0.11"

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

k6:
  enabled: false
  vus: "10"
  duration: "5m"

playwright:
  enabled: false
  runContinuously: "false"
  iterations: "1"
```

### Upgrade Deployment

```bash
helm upgrade vegas-casino ./helm/vegas-casino \
  --set global.imageTag=0.12
```

### Rollback

```bash
# List revisions
helm history vegas-casino

# Rollback to previous version
helm rollback vegas-casino
```

### Uninstall

```bash
helm uninstall vegas-casino
```

**Note**: This does NOT uninstall the OpenFeature Operator.

## 📊 Observability

The application is fully instrumented with **OpenTelemetry**:

- **Distributed Tracing**: End-to-end trace correlation across all services
- **Metrics**: Application and business metrics
- **Logging**: Structured JSON logging
- **Feature Flag Tracing**: Feature flag evaluations are traced
- **Database Instrumentation**: Redis and PostgreSQL operations are instrumented

### OpenTelemetry Configuration

- **Protocol**: gRPC (OTLP)
- **Endpoint**: `otel-collector.default.svc.cluster.local:4317`
- **Export**: Automatic via OpenTelemetry SDKs

## 🧪 Testing

The project includes two types of automated testing:

### Playwright (E2E Automation)
- Simulates complete user journeys
- Tests all games, feature flags, and dashboard
- Configurable via Helm values

### k6 (Load Testing)
- Performance and scalability testing
- Configurable virtual users and duration
- Generates realistic traffic and traces

See the [Testing Documentation](docs/testing/index.md) for details.

## 📚 Documentation

Comprehensive documentation is available via **MkDocs**:

```bash
# Serve documentation locally
make docs-serve

# Build static documentation
make docs-build
```

Documentation includes:
- Architecture details
- Component descriptions
- Build instructions
- Deployment guides
- Testing guides
- Feature flag management

## 🎯 Hackathon Objectives

This project is designed for **observability hackathons** where attendees will:

1. **Improve Instrumentation**: Add and enhance OpenTelemetry spans
2. **Optimize Pipelines**: Configure and tune observability data pipelines
3. **Implement Feature Flags**: Integrate and manage feature flags
4. **Enhance Testing**: Create and run load tests
5. **Practice Deployment**: Deploy and manage in Kubernetes

## 🛠️ Technology Stack

- **Languages**: Node.js, Python, Go, Java
- **Frameworks**: Express.js, Flask, Spring Boot
- **Databases**: Redis, PostgreSQL
- **Observability**: OpenTelemetry, OpenFeature
- **Orchestration**: Kubernetes, Helm
- **Testing**: Playwright, k6

## 📝 License

This project is designed for educational and hackathon purposes.

## 🤝 Contributing

See [Contributing Guide](docs/contributing.md) for details on how to contribute to the project.

---

**Ready to get started?** Serve the documentation locally with `make docs-serve` or start with [Building the Project](#-building-the-project)!
