# Components

## Core Services

### Frontend Service
- **Language**: Node.js/Express
- **Port**: 3000 (HTTP)
- **Purpose**: Web UI gateway, user management, game orchestration, balance management
- **Key Features**:
  - **User Authentication**: Login screen with profile creation (name, email, profile type, starting balance)
  - **Static File Serving**: Serves HTML, CSS, JS files for game UIs
  - **Balance Management**: Direct Redis connection for all balance operations
    - User balance storage and retrieval
    - Balance updates on deposits and game results
    - User profile information storage
  - **gRPC Client**: Primary communication protocol
    - Game services (Slots, Roulette, Dice, Blackjack)
    - Dashboard service for statistics
  - **HTTP REST API**: Browser-facing endpoints
    - `/api/user/*` - User management (login, balance, topup, init)
    - `/api/games/{game}/play` - Game play requests (converts to gRPC)
    - `/api/dashboard/*` - Dashboard data (converts to gRPC)
  - **Browser-side OpenTelemetry**: Automatic instrumentation for browser requests
  - **Trace Context Propagation**: W3C TraceContext across all services

### Game Services

#### Slots Service
- **Language**: Node.js
- **Ports**: 8081 (HTTP - legacy), 50051 (gRPC - primary)
- **Purpose**: Slot machine game logic
- **Communication**:
  - Receives gRPC requests from Frontend Service
  - Calls Scoring Service via HTTP to record results
- **Features**:
  - Progressive jackpot support
  - Bonus rounds
  - Cheat detection (feature flag)
  - Redis state management for game sessions
  - Records wins to Scoring Service

#### Roulette Service
- **Language**: Python/Flask
- **Ports**: 8082 (HTTP - legacy), 50052 (gRPC - primary)
- **Purpose**: European roulette game
- **Communication**:
  - Receives gRPC requests from Frontend Service
  - Calls Scoring Service via HTTP to record results
- **Features**:
  - Multiple bet types (number, color, high/low, odd/even)
  - Complex multiple bets support
  - Live wheel simulation
  - Cheat codes (feature flag)
  - Redis state management for game sessions
  - Records wins to Scoring Service

#### Dice Service
- **Language**: Go
- **Ports**: 8083 (HTTP - legacy), 50053 (gRPC - primary)
- **Purpose**: Craps/dice game
- **Communication**:
  - Receives gRPC requests from Frontend Service
  - Calls Scoring Service via HTTP to record results
- **Features**:
  - Pass-line and come bets
  - Feature flag integration
  - Redis state management for game sessions
  - Records wins to Scoring Service

#### Blackjack Service
- **Language**: Node.js
- **Ports**: 8084 (HTTP - legacy), 50054 (gRPC - primary)
- **Purpose**: Blackjack card game
- **Communication**:
  - Receives gRPC requests from Frontend Service
  - Calls Scoring Service via HTTP to record results
- **Features**:
  - Double down, insurance, surrender
  - Feature flag integration
  - Redis state management for game sessions
  - Records wins to Scoring Service

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
- **Ports**: 3001 (HTTP), 50055 (gRPC)
- **Purpose**: Analytics and reporting dashboard
- **Features**:
  - Game statistics visualization
  - Top players display
  - Win/loss analytics
  - Real-time data from scoring service
  - gRPC API for dashboard statistics
  - Aggregates data from scoring service via HTTP

## Supporting Services

### Redis
- **Purpose**: Game state storage, session management, user balance storage
- **Port**: 6379
- **Usage**: 
  - All game services use Redis for state persistence
  - **Frontend directly connects to Redis** for user balance storage and retrieval
  - Frontend stores user balances with key pattern: `balance:{username}`
  - Frontend stores user profile information (email, profile type, balance, created timestamp)
  - Stores game state during active sessions
  - All balance operations (deposit, init, login) are persisted in Redis
- **Configuration**: Environment variables `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
- **Connection**: Direct Redis client connection (not through game services)

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

### gRPC (Primary Protocol for Service-to-Service)
- **Frontend → Game Services**: **ONLY gRPC** (no HTTP fallback)
  - Slots: Port 50051
  - Roulette: Port 50052
  - Dice: Port 50053
  - Blackjack: Port 50054
- **Frontend → Dashboard Service**: gRPC (Port 50055)
- **Protocol**: Protocol Buffers for type safety
- **Benefits**: Better performance, type safety, streaming support
- **Note**: Frontend service exposes HTTP REST endpoints (`/api/games/*`) that the browser calls, but these endpoints internally convert to gRPC calls to game services

### HTTP (REST APIs)
- **Browser → Frontend Service**: All browser requests use HTTP (Port 3000)
  - Static file serving (HTML, CSS, JS)
  - REST API endpoints:
    - `/api/user/*` - User management (login, balance, topup, init)
    - `/api/games/:gameId/spin` - Game play (converts to gRPC internally)
    - `/api/games/:gameId/roll` - Game play (converts to gRPC internally)
    - `/api/games/:gameId/deal` - Game play (converts to gRPC internally)
    - `/api/dashboard/*` - Dashboard data (converts to gRPC internally)
- **Dashboard → Scoring Service**: HTTP REST API (Port 8085)
- **Game Services → Scoring Service**: HTTP REST API for recording results

### Redis (Direct Connection)
- **Frontend → Redis**: Direct Redis client connection
  - User balance storage and retrieval
  - User profile information storage
  - Operations: `GET`, `SET`, `INCRBY` for balance management
  - Key patterns: `balance:{username}`, `user:{username}`
- **Game Services → Redis**: Direct Redis connections for game state
- **Protocol**: Redis protocol (RESP)
- **Port**: 6379

### Database (PostgreSQL)
- **Scoring Service → PostgreSQL**: Direct database connection
  - Game results storage
  - Player scores and leaderboards
  - Dashboard statistics queries

---

**Next**: Explore [Development](../development/source-code.md).

