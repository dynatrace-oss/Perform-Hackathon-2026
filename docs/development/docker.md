# Docker Images

## Image Overview

The Vegas Casino project consists of multiple Docker images, each serving a specific purpose in the microservices architecture.

## Available Images

### Application Images

| Service | Base Image | Ports | Purpose |
|---------|-----------|-------|---------|
| `frontend` | `node:18-alpine` | 3000 | Web UI and API gateway |
| `slots` | `node:18-alpine` | 8081, 50051 | Slots game service |
| `roulette` | `python:3.11-slim` | 8082, 50052 | Roulette game service |
| `dice` | `golang:1.21-alpine` | 8083, 50053 | Dice game service |
| `blackjack` | `node:18-alpine` | 8084, 50054 | Blackjack game service |
| `scoring` | `eclipse-temurin:17-jre-alpine` | 8085 | Scoring and leaderboard service |
| `dashboard` | `node:18-alpine` | 3001 | Analytics dashboard |

### Testing Images

| Service | Base Image | Purpose |
|---------|-----------|---------|
| `playwright` | `mcr.microsoft.com/playwright:v1.40.0-focal` | Browser automation |
| `k6` | `grafana/k6:latest` | Load testing |

## Image Structure

### Node.js Services
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY services/{service}/ ./
COPY services/common/ ./common/
CMD ["node", "service-file.js"]
```

### Python Services
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY services/{service}/ ./
CMD ["python", "service-file.py"]
```

### Go Services
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go build -o service-binary

FROM alpine:latest
COPY --from=builder /app/service-binary /service-binary
CMD ["/service-binary"]
```

### Java Services
```dockerfile
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /app
COPY pom.xml ./
RUN mvn dependency:go-offline
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:17-jre-alpine
COPY --from=builder /app/target/*.jar app.jar
CMD ["java", "-jar", "app.jar"]
```

## Environment Variables

All images support environment variables for configuration:

### Common Variables
- `PORT`: Service HTTP port
- `OTEL_EXPORTER_OTLP_ENDPOINT`: OpenTelemetry collector endpoint
- `OTEL_EXPORTER_OTLP_PROTOCOL`: Protocol (grpc/http)

### Service-Specific Variables
- `REDIS_HOST`, `REDIS_PORT`: Redis connection
- `SCORING_SERVICE_URL`: Scoring service endpoint
- `FLAGD_HOST`, `FLAGD_PORT`: Feature flag service (if not using operator)

## Image Tags

Images are tagged with:
- **Version Tag**: From `IMAGE_TAG` (default: `0.10`)
- **Latest Tag**: `latest` (optional)

Example:
```bash
hrexed/vegasapp-frontend:0.10
hrexed/vegasapp-frontend:latest
```

## Building Images

See [Building the Project](building.md) for detailed build instructions.

## Pushing Images

### To Docker Hub
```bash
# Login first
docker login

# Push images
make docker-push-all
```

### To Private Registry
```bash
# Set registry
export REGISTRY=your-registry.com/vegasapp
make docker-build-all
make docker-push-all
```

## Image Sizes

Approximate image sizes:

| Image | Size |
|-------|------|
| `frontend` | ~150MB |
| `slots` | ~150MB |
| `roulette` | ~200MB |
| `dice` | ~20MB |
| `blackjack` | ~150MB |
| `scoring` | ~200MB |
| `dashboard` | ~150MB |
| `playwright` | ~1.5GB |
| `k6` | ~50MB |

## Multi-Stage Builds

Several services use multi-stage builds to reduce final image size:

- **Go Services**: Build binary in builder stage, copy to minimal runtime
- **Java Services**: Build JAR in Maven stage, copy to JRE-only runtime

## Image Security

- **Base Images**: Use official, regularly updated base images
- **Non-Root Users**: Services run as non-root when possible
- **Minimal Images**: Alpine-based images for smaller attack surface
- **Dependency Scanning**: Regularly update dependencies

---

**Next**: Learn about [Testing](../testing/index.md) or [Deployment](../deployment/index.md).

