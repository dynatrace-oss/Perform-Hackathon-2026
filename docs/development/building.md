# Building the Project

## Prerequisites

Before building the project, ensure you have:

- **Docker** or **Podman** installed
- **Make** installed
- **Access to container registry** (optional, for pushing images)

## Build Configuration

The project uses a `Makefile` for build automation. Key configuration variables:

```makefile
REGISTRY ?= hrexed/vegasapp
IMAGE_TAG ?= 0.39
BUILDER ?= podman  # or docker
PLATFORM ?= linux/amd64
```

## Building Individual Services

### Build Frontend Service
```bash
make docker-build-frontend
```

### Build Game Services
```bash
make docker-build-slots
make docker-build-roulette
make docker-build-dice
make docker-build-blackjack
```

### Build Supporting Services
```bash
make docker-build-scoring    # Java/Spring Boot
make docker-build-dashboard  # Node.js
make docker-build-playwright # Automation
make docker-build-k6         # Load testing
```

## Building All Services

To build all Docker images at once:

```bash
make docker-build-all
```

This will build images for:
- Frontend
- Slots
- Roulette
- Dice
- Blackjack
- Scoring
- Dashboard
- Playwright
- k6

## Image Naming Convention

Images follow the pattern:
```
{REGISTRY}-{service}:{IMAGE_TAG}
```

Example:
- `hrexed/vegasapp-frontend:0.39`
- `hrexed/vegasapp-slots:0.39`
- `hrexed/vegasapp-scoring:0.39`

## Pushing Images

### Push Individual Image
```bash
make docker-push-frontend
make docker-push-slots
# ... etc
```

### Push All Images
```bash
make docker-push-all
```

## Build Process Details

### Node.js Services
1. Copy `package.json` and install dependencies
2. Copy source code
3. Set up OpenTelemetry and common modules
4. Build final image

### Python Services
1. Copy `requirements.txt` and install dependencies
2. Copy source code
3. Set up OpenTelemetry
4. Build final image

### Go Services
1. Copy `go.mod` and `go.sum`
2. Run `go mod tidy`
3. Copy source files
4. Build binary
5. Create minimal runtime image

### Java Services
1. Copy `pom.xml`
2. Run Maven build (`mvn clean package`)
3. Copy JAR file
4. Create runtime image with JRE

## Troubleshooting

### Build Failures

**Issue**: Node.js dependencies fail to install
```bash
# Solution: Clear npm cache and rebuild
docker system prune -a
make docker-build-frontend
```

**Issue**: Go build fails
```bash
# Solution: Ensure Go modules are up to date
cd services/dice/go
go mod tidy
```

**Issue**: Maven build fails
```bash
# Solution: Clear Maven cache
cd services/scoring
mvn clean
make docker-build-scoring
```

### Platform-Specific Issues

For ARM64 (Apple Silicon):
```bash
make docker-build-all PLATFORM=linux/arm64
```

For multi-platform builds:
```bash
docker buildx build --platform linux/amd64,linux/arm64 -t image:tag .
```

## Build Verification

After building, verify images:

```bash
# List all images
docker images | grep vegasapp

# Test an image
docker run --rm hrexed/vegasapp-frontend:0.10 node --version
```

## Next Steps

After building images:
1. [Push to registry](docker.md#pushing-images)
2. [Deploy with Helm](../deployment/helm.md)
3. [Run tests](../testing/index.md)

---

**Next**: Learn about [Docker Images](docker.md) or [Deployment](../deployment/index.md).

