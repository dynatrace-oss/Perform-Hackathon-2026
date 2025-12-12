# Components

## Core Services

### Frontend Service
- **Language**: Node.js/Express
- **Port**: 3000 (HTTP)
- **Purpose**: Web UI for players, game selection, balance management
- **Key Features**:
  - User authentication and session management
  - Game UI rendering
  - Balance management
  - gRPC client for game services
  - Browser-side OpenTelemetry instrumentation
  - Redis integration for balance caching

### Game Services

#### Slots Service
- **Language**: Node.js
- **Ports**: 8081 (HTTP), 50051 (gRPC)
- **Purpose**: Slot machine game logic
- **Features**:
  - Progressive jackpot support
  - Bonus rounds
  - Cheat detection (feature flag)
  - Redis state management

#### Roulette Service
- **Language**: Python/Flask
- **Ports**: 8082 (HTTP), 50052 (gRPC)
- **Purpose**: European roulette game
- **Features**:
  - Multiple bet types
  - Live wheel simulation
  - Cheat codes (feature flag)
  - Redis state management

#### Dice Service
- **Language**: Go
- **Ports**: 8083 (HTTP), 50053 (gRPC)
- **Purpose**: Craps/dice game
- **Features**:
  - Pass-line and come bets
  - Feature flag integration
  - Redis state management

#### Blackjack Service
- **Language**: Node.js
- **Ports**: 8084 (HTTP), 50054 (gRPC)
- **Purpose**: Blackjack card game
- **Features**:
  - Double down, insurance, surrender
  - Feature flag integration
  - Redis state management

### Scoring Service
- **Language**: Java/Spring Boot
- **Port**: 8085 (HTTP)
- **Purpose**: Game statistics, leaderboards, scoring
- **Database**: PostgreSQL
- **Features**:
  - Player score tracking
  - Game result storage
  - Dashboard statistics
  - Top players leaderboard

### Dashboard Service
- **Language**: Node.js/Express
- **Port**: 3001 (HTTP)
- **Purpose**: Analytics and reporting dashboard
- **Features**:
  - Game statistics visualization
  - Top players display
  - Win/loss analytics
  - Real-time data from scoring service

## Supporting Services

### Redis
- **Purpose**: Game state storage, session management, balance caching
- **Port**: 6379
- **Usage**: 
  - All game services use Redis for state persistence
  - Frontend uses Redis for balance caching
  - Stores game state during active sessions
- **Configuration**: Environment variables `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`

### PostgreSQL
- **Purpose**: Persistent storage for scores and game results
- **Port**: 5432
- **Schema**: 
  - `player_scores` table - Stores player leaderboard data
  - `game_results` table - Stores individual game results
- **Configuration**: Environment variables `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### OpenTelemetry Collector
- **Purpose**: Receives telemetry data and exports to observability platform
- **Port**: 4317 (gRPC), 4318 (HTTP)
- **Protocol**: gRPC (primary)

## Feature Flag Infrastructure

### OpenFeature Operator
- **Purpose**: Kubernetes operator for automatic flagd sidecar injection
- **CRDs**: 
  - `FeatureFlagSource`: Links flagd to flag definitions
  - `FeatureFlag`: Defines feature flag configurations
- **Installation**: Must be installed before application deployment

### flagd
- **Purpose**: Feature flag evaluation service (runs as sidecar)
- **Port**: 8014 (gRPC), 8015 (Management)
- **Integration**: Injected automatically by OpenFeature Operator
- **Configuration**: Via FeatureFlagSource CRD
- **Language Support**: 
  - Node.js: `@openfeature/flagd-provider`
  - Go: `github.com/open-feature/go-sdk-contrib/providers/flagd`
  - Python: `openfeature-flagd-provider` (if available)

## Testing Components

### Playwright Automation
- **Purpose**: End-to-end user journey simulation
- **Language**: Node.js
- **Features**:
  - User registration and login
  - Game play simulation
  - Feature flag interaction
  - Dashboard verification

### k6 Load Testing
- **Purpose**: Performance and load testing
- **Language**: JavaScript (k6)
- **Features**:
  - Configurable virtual users
  - Ramp-up and duration control
  - Custom metrics
  - Real-time performance monitoring

## Communication Patterns

### gRPC (Primary)
- Frontend → Game Services
- Protocol Buffers for type safety
- Better performance than HTTP

### HTTP (Fallback/API)
- Frontend → Dashboard
- Dashboard → Scoring
- Game Services → Scoring
- RESTful API design

### Redis Pub/Sub (Future)
- Real-time game events
- Notifications

---

**Next**: Learn about the [Technology Stack](technology.md) or start [Building](../development/building.md).

