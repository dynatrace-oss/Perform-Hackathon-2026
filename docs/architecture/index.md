# Architecture Overview

## System Architecture

Vegas Casino follows a **microservices architecture** with multiple independent services communicating via HTTP and gRPC protocols.

```mermaid
graph TB
    Frontend[Frontend Service<br/>Node.js/Express<br/>Port: 3000]
    
    Slots[Slots Service<br/>Node.js<br/>Ports: 8081, 50051]
    Roulette[Roulette Service<br/>Python<br/>Ports: 8082, 50052]
    Dice[Dice Service<br/>Go<br/>Ports: 8083, 50053]
    Blackjack[Blackjack Service<br/>Node.js<br/>Ports: 8084, 50054]
    
    Dashboard[Dashboard Service<br/>Node.js<br/>Port: 3001]
    Scoring[Scoring Service<br/>Java/Spring Boot<br/>Port: 8085]
    
    Redis[(Redis Cache<br/>State Store<br/>Port: 6379)]
    PostgreSQL[(PostgreSQL<br/>Database<br/>Port: 5432)]
    
    Frontend -->|gRPC/HTTP| Slots
    Frontend -->|gRPC/HTTP| Roulette
    Frontend -->|gRPC/HTTP| Dice
    Frontend -->|gRPC/HTTP| Blackjack
    Frontend -->|HTTP| Dashboard
    
    Slots --> Redis
    Roulette --> Redis
    Dice --> Redis
    Blackjack --> Redis
    
    Slots -->|HTTP| Scoring
    Roulette -->|HTTP| Scoring
    Dice -->|HTTP| Scoring
    Blackjack -->|HTTP| Scoring
    
    Dashboard -->|HTTP| Scoring
    Scoring --> PostgreSQL
    
    style Frontend fill:#9333ea,stroke:#7c3aed,color:#fff
    style Dashboard fill:#9333ea,stroke:#7c3aed,color:#fff
    style Slots fill:#06b6d4,stroke:#0891b2,color:#fff
    style Roulette fill:#06b6d4,stroke:#0891b2,color:#fff
    style Dice fill:#06b6d4,stroke:#0891b2,color:#fff
    style Blackjack fill:#06b6d4,stroke:#0891b2,color:#fff
    style Scoring fill:#dc2626,stroke:#b91c1c,color:#fff
    style Redis fill:#f59e0b,stroke:#d97706,color:#fff
    style PostgreSQL fill:#10b981,stroke:#059669,color:#fff
```

## Service Communication

### HTTP Communication
- Frontend ↔ Game Services (fallback)
- Frontend ↔ Dashboard Service
- Dashboard ↔ Scoring Service
- Game Services ↔ Scoring Service

### gRPC Communication
- Frontend ↔ Game Services (primary)
- All services use gRPC for better performance and type safety

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Game as Game Service
    participant Redis
    participant Scoring
    participant PostgreSQL
    participant Dashboard
    
    User->>Frontend: User Action (Play Game)
    Frontend->>Game: gRPC Request
    Game->>Redis: Store Game State
    Game->>Game: Process Game Logic
    Game->>Redis: Update State
    Game->>Scoring: Record Game Result (HTTP)
    Scoring->>PostgreSQL: Persist Score
    Game-->>Frontend: Game Response
    Frontend-->>User: Display Result
    
    User->>Dashboard: View Statistics
    Dashboard->>Scoring: Query Stats (HTTP)
    Scoring->>PostgreSQL: Query Data
    PostgreSQL-->>Scoring: Return Data
    Scoring-->>Dashboard: Stats Response
    Dashboard-->>User: Display Dashboard
```

## Observability Stack

```mermaid
graph LR
    subgraph "Application Services"
        Frontend[Frontend]
        Game1[Game Services]
        Scoring[Scoring]
        Dashboard[Dashboard]
    end
    
    subgraph "OpenTelemetry"
        OTEL[OTEL SDK<br/>Auto-instrumentation]
        OTLP[OTLP Exporter<br/>gRPC]
    end
    
    subgraph "Infrastructure"
        Collector[OTEL Collector<br/>Port: 4317]
        Platform[Observability Platform<br/>Dynatrace/Other]
    end
    
    Frontend --> OTEL
    Game1 --> OTEL
    Scoring --> OTEL
    Dashboard --> OTEL
    
    OTEL --> OTLP
    OTLP -->|gRPC| Collector
    Collector --> Platform
    
    style OTEL fill:#06b6d4,stroke:#0891b2,color:#fff
    style Collector fill:#9333ea,stroke:#7c3aed,color:#fff
    style Platform fill:#10b981,stroke:#059669,color:#fff
```

- **OpenTelemetry**: Distributed tracing and metrics
- **OpenTelemetry Collector**: Receives and exports telemetry data
- **gRPC Exporter**: Sends traces to collector on port 4317
- **Trace Context Propagation**: W3C Trace Context across all services

## Feature Flag Management

```mermaid
graph TB
    subgraph "Kubernetes Cluster"
        subgraph "OpenFeature Operator"
            Operator[Operator Controller]
        end
        
        subgraph "Application Pod"
            Service[Application Service]
            Flagd[flagd Sidecar<br/>Port: 8014]
        end
        
        CRD[FeatureFlag CRD<br/>Flag Definitions]
        Source[FeatureFlagSource CRD<br/>Configuration]
    end
    
    Operator -->|Watches| Service
    Operator -->|Injects| Flagd
    Source -->|Configures| Flagd
    CRD -->|Provides Flags| Flagd
    Service -->|localhost:8014| Flagd
    Flagd -->|Reads| CRD
    
    style Operator fill:#dc2626,stroke:#b91c1c,color:#fff
    style Flagd fill:#f59e0b,stroke:#d97706,color:#fff
    style CRD fill:#10b981,stroke:#059669,color:#fff
```

- **OpenFeature Operator**: Manages flagd sidecar injection
- **flagd**: Feature flag evaluation service (sidecar)
- **FeatureFlagSource**: Kubernetes CRD for flag configuration
- **FeatureFlag**: Kubernetes CRD for flag definitions

---

**Next**: Learn about [Components](components.md) or the [Technology Stack](technology.md).

