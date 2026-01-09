# Architecture Overview

## System Architecture

Vegas Casino follows a **microservices architecture** with multiple independent services. The frontend service uses **gRPC exclusively** to communicate with game services (no HTTP fallback). HTTP is only used for browser-to-frontend communication and service-to-scoring communication.

```mermaid
graph TB
    Browser[Browser<br/>HTTP Client]
    Frontend[Frontend Service<br/>Node.js/Express<br/>Port: 3000<br/>HTTP + gRPC Client]
    
    Slots[Slots Service<br/>Node.js<br/>gRPC: 50051<br/>HTTP: 8081 legacy]
    Roulette[Roulette Service<br/>Python<br/>gRPC: 50052<br/>HTTP: 8082 legacy]
    Dice[Dice Service<br/>Go<br/>gRPC: 50053<br/>HTTP: 8083 legacy]
    Blackjack[Blackjack Service<br/>Node.js<br/>gRPC: 50054<br/>HTTP: 8084 legacy]
    
    Dashboard[Dashboard Service<br/>Node.js<br/>gRPC: 50055<br/>HTTP: 3001]
    Scoring[Scoring Service<br/>Java/Spring Boot<br/>HTTP: 8085]
    
    Redis[(Redis<br/>Port: 6379)]
    PostgreSQL[(PostgreSQL<br/>Port: 5432)]
    
    Browser -->|HTTP REST API| Frontend
    Frontend -->|gRPC ONLY| Slots
    Frontend -->|gRPC ONLY| Roulette
    Frontend -->|gRPC ONLY| Dice
    Frontend -->|gRPC ONLY| Blackjack
    Frontend -->|gRPC| Dashboard
    Frontend -->|Redis Direct| Redis
    
    Slots -->|Redis Direct| Redis
    Roulette -->|Redis Direct| Redis
    Dice -->|Redis Direct| Redis
    Blackjack -->|Redis Direct| Redis
    
    Slots -->|HTTP| Scoring
    Roulette -->|HTTP| Scoring
    Dice -->|HTTP| Scoring
    Blackjack -->|HTTP| Scoring
    
    Dashboard -->|HTTP| Scoring
    Scoring -->|PostgreSQL| PostgreSQL
    
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
- **Browser → Frontend Service**: All browser requests use HTTP (Port 3000)
  - Static files (HTML, CSS, JS)
  - REST API endpoints:
    - `/api/user/*` - User management (login, balance, topup, init)
    - `/api/games/:gameId/spin` - Game play (internally converts to gRPC)
    - `/api/games/:gameId/roll` - Game play (internally converts to gRPC)
    - `/api/games/:gameId/deal` - Game play (internally converts to gRPC)
    - `/api/dashboard/*` - Dashboard data (internally converts to gRPC)
- **Dashboard → Scoring Service**: HTTP REST API (Port 8085)
- **Game Services → Scoring Service**: HTTP REST API for recording game results

### gRPC Communication (Service-to-Service)
- **Frontend → Game Services**: **ONLY gRPC** (no HTTP fallback)
  - All game interactions use gRPC exclusively:
    - Slots: `Spin()` method via gRPC (Port 50051)
    - Roulette: `Spin()` method via gRPC (Port 50052)
    - Dice: `Roll()` method via gRPC (Port 50053)
    - Blackjack: `Deal()`, `Hit()`, `Stand()`, `Double()` methods via gRPC (Port 50054)
  - **No HTTP fallback**: If gRPC fails, the request fails (no HTTP retry)
- **Frontend → Dashboard Service**: gRPC (Port 50055) for dashboard statistics
  - Methods: `getAllDashboardStats()`, `getDashboardStats(game)`
- **Protocol**: Protocol Buffers for type safety and better performance
- **Important**: Frontend HTTP endpoints (`/api/games/*`) are browser-facing REST APIs that internally convert to gRPC calls. The browser never directly calls game services.

### Redis Communication
- Frontend ↔ Redis (direct connection for balance and user profile management)
- Game Services ↔ Redis (direct connection for game state storage)

## Data Flow

### User Login and Profile Creation

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Redis
    
    Browser->>Frontend: POST /api/user/login<br/>(name, email, profileType, balance)
    Frontend->>Redis: SET balance:{username}
    Frontend->>Redis: SET user:{username}<br/>(email, profileType, createdAt)
    Redis-->>Frontend: Success
    Frontend-->>Browser: User profile created
    Browser->>Browser: Store in localStorage<br/>(username, email, profileType)
```

### Game Play Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Redis
    participant Game as Game Service
    participant Scoring
    participant PostgreSQL
    
    Browser->>Frontend: POST /api/games/{game}/play<br/>(HTTP Request)
    Frontend->>Redis: GET balance:{username}
    Redis-->>Frontend: Current Balance
    Frontend->>Game: gRPC Call<br/>(Spin/Roll/Deal with bet_amount)
    Game->>Redis: Store Game State
    Game->>Game: Process Game Logic
    Game->>Redis: Update Game State
    Game->>Scoring: POST /api/scoring/result<br/>(HTTP - Record win/loss)
    Scoring->>PostgreSQL: INSERT game_result
    Scoring-->>Game: Success
    Game-->>Frontend: gRPC Response<br/>(result, payout, new_balance)
    Frontend->>Redis: SET balance:{username}<br/>(Update with new balance)
    Frontend-->>Browser: JSON Response<br/>(game result, updated balance)
    Browser->>Browser: Update UI
```

### Dashboard View Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Dashboard as Dashboard Service
    participant Scoring
    participant PostgreSQL
    
    Browser->>Frontend: GET /api/dashboard<br/>(HTTP Request)
    Frontend->>Dashboard: gRPC getAllDashboardStats()
    Dashboard->>Scoring: GET /api/scoring/stats<br/>(HTTP Request)
    Scoring->>PostgreSQL: SELECT game_results, player_scores
    PostgreSQL-->>Scoring: Statistics Data
    Scoring-->>Dashboard: JSON Response
    Dashboard-->>Frontend: gRPC Response<br/>(aggregated stats)
    Frontend-->>Browser: JSON Response<br/>(dashboard data)
    Browser->>Browser: Render Charts & Tables
```

### Balance Management Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Frontend
    participant Redis
    
    Browser->>Frontend: POST /api/user/topup<br/>(amount)
    Frontend->>Redis: GET balance:{username}
    Redis-->>Frontend: Current Balance
    Frontend->>Redis: INCRBY balance:{username}<br/>(add amount)
    Redis-->>Frontend: New Balance
    Frontend-->>Browser: Updated Balance
    
    Browser->>Frontend: GET /api/user/balance<br/>(username)
    Frontend->>Redis: GET balance:{username}
    Redis-->>Frontend: Balance
    Frontend-->>Browser: Balance
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

