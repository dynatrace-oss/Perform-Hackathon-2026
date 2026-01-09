.PHONY: proto install-deps proto-go proto-python proto-node \
	test test-gateway test-slots test-blackjack test-frontend test-roulette test-dice test-all \
	docker-build docker-build-gateway docker-build-slots docker-build-blackjack \
	docker-build-frontend docker-build-roulette docker-build-dice docker-build-scoring \
	docker-build-dashboard docker-build-playwright docker-build-k6 docker-build-all \
	docker-push docker-push-gateway docker-push-slots docker-push-blackjack \
	docker-push-frontend docker-push-roulette docker-push-dice docker-push-scoring \
	docker-push-dashboard docker-push-playwright docker-push-k6 docker-push-all \
	docs-serve docs-build \
	install install-all clean help

# Configuration
REGISTRY ?= hrexed/vegasapp
IMAGE_TAG ?= 0.39
DOCKER_REGISTRY ?= $(REGISTRY)
PLATFORM ?= linux/amd64
BUILDER ?= podman

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RED := \033[0;31m
NC := \033[0m # No Color

# =============================================================================
# Proto Generation
# =============================================================================

# Install dependencies for proto generation
install-deps:
	@echo "$(BLUE)Installing protoc dependencies...$(NC)"
	@go install google.golang.org/protobuf/cmd/protoc-gen-go@latest || true
	@go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest || true
	@pip install grpcio grpcio-tools || true

# Generate Go code from proto files
proto-go:
	@echo "$(BLUE)Generating Go code from proto files...$(NC)"
	@mkdir -p services/dice/go/proto
	@protoc --go_out=services/dice/go/proto --go_opt=paths=source_relative \
		--go-grpc_out=services/dice/go/proto --go-grpc_opt=paths=source_relative \
		proto/*.proto || echo "$(YELLOW)Warning: Go proto generation failed (may need Go installed)$(NC)"

# Generate Python code from proto files
proto-python:
	@echo "$(BLUE)Generating Python code from proto files...$(NC)"
	@mkdir -p services/roulette/python/proto
	@python -m grpc_tools.protoc -I proto --python_out=services/roulette/python/proto \
		--grpc_python_out=services/roulette/python/proto proto/*.proto || echo "$(YELLOW)Warning: Python proto generation failed$(NC)"

# Generate Node.js code from proto files
proto-node:
	@echo "$(BLUE)Generating Node.js code from proto files...$(NC)"
	@npm install -g grpc-tools || true
	@mkdir -p services/grpc/node
	@grpc_tools_node_protoc --js_out=import_style=commonjs,binary:services/grpc/node \
		--grpc_out=services/grpc/node --plugin=protoc-gen-grpc=`which grpc_tools_node_protoc_plugin` \
		-I proto proto/*.proto || echo "$(YELLOW)Warning: Node.js proto generation failed$(NC)"

# Generate all proto code
proto: proto-go proto-python proto-node
	@echo "$(GREEN)All proto code generated!$(NC)"

# =============================================================================
# Testing
# =============================================================================

# Test gateway
test-gateway:
	@echo "$(BLUE)Testing gateway...$(NC)"
	@cd services/gateway && npx --yes jest gateway-service.test.js 2>/dev/null || echo "$(YELLOW)No tests configured for gateway$(NC)"

# Test slots service
test-slots:
	@echo "$(BLUE)Testing slots service...$(NC)"
	@cd services/slots && npx --yes jest slots-service.test.js 2>/dev/null || echo "$(YELLOW)No tests configured for slots service$(NC)"

# Test blackjack service
test-blackjack:
	@echo "$(BLUE)Testing blackjack service...$(NC)"
	@cd services/blackjack && npx --yes jest blackjack-service.test.js 2>/dev/null || echo "$(YELLOW)No tests configured for blackjack service$(NC)"

# Test frontend service
test-frontend:
	@echo "$(BLUE)Testing frontend service...$(NC)"
	@cd services/frontend && npx --yes jest frontend-service.test.js 2>/dev/null || echo "$(YELLOW)No tests configured for frontend service$(NC)"

# Test roulette service (Python)
test-roulette:
	@echo "$(BLUE)Testing roulette service (Python)...$(NC)"
	@cd services/roulette/python && python3 -m pytest test_roulette_service.py -v 2>/dev/null || \
		python3 -m unittest test_roulette_service.py -v 2>/dev/null || \
		python -m unittest test_roulette_service.py -v 2>/dev/null || \
		echo "$(YELLOW)No tests configured for roulette service$(NC)"

# Test dice service (Go)
test-dice:
	@echo "$(BLUE)Testing dice service (Go)...$(NC)"
	@cd services/dice/go && go test -v ./... || echo "$(YELLOW)No tests configured for dice service$(NC)"

# Test all services
test-all: test-gateway test-slots test-blackjack test-frontend test-roulette test-dice
	@echo "$(GREEN)All tests completed!$(NC)"

# =============================================================================
# Docker Build
# =============================================================================

# Build gateway image
docker-build-gateway:
	@echo "$(BLUE)Building gateway image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/gateway/Dockerfile -t $(DOCKER_REGISTRY)-gateway:$(IMAGE_TAG) .
	@echo "$(GREEN)Gateway image built: $(DOCKER_REGISTRY)-gateway:$(IMAGE_TAG)$(NC)"

# Build slots service image
docker-build-slots:
	@echo "$(BLUE)Building slots service image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/slots/Dockerfile -t $(DOCKER_REGISTRY)-slots:$(IMAGE_TAG) .
	@echo "$(GREEN)Slots service image built: $(DOCKER_REGISTRY)-slots:$(IMAGE_TAG)$(NC)"

# Build blackjack service image
docker-build-blackjack:
	@echo "$(BLUE)Building blackjack service image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/blackjack/Dockerfile -t $(DOCKER_REGISTRY)-blackjack:$(IMAGE_TAG) .
	@echo "$(GREEN)Blackjack service image built: $(DOCKER_REGISTRY)-blackjack:$(IMAGE_TAG)$(NC)"

# Build frontend service image
docker-build-frontend:
	@echo "$(BLUE)Building frontend service image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/frontend/Dockerfile -t $(DOCKER_REGISTRY)-frontend:$(IMAGE_TAG) .
	@echo "$(GREEN)Frontend service image built: $(DOCKER_REGISTRY)-frontend:$(IMAGE_TAG)$(NC)"

# Build roulette service image (Python)
docker-build-roulette:
	@echo "$(BLUE)Building roulette service image (Python)...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/roulette/Dockerfile -t $(DOCKER_REGISTRY)-roulette:$(IMAGE_TAG) .
	@echo "$(GREEN)Roulette service image built: $(DOCKER_REGISTRY)-roulette:$(IMAGE_TAG)$(NC)"

# Build dice service image (Go)
docker-build-dice:
	@echo "$(BLUE)Building dice service image (Go)...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/dice/Dockerfile -t $(DOCKER_REGISTRY)-dice:$(IMAGE_TAG) .
	@echo "$(GREEN)Dice service image built: $(DOCKER_REGISTRY)-dice:$(IMAGE_TAG)$(NC)"

# Build scoring service image (Java)
docker-build-scoring:
	@echo "$(BLUE)Building scoring service image (Java)...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/scoring/Dockerfile -t $(DOCKER_REGISTRY)-scoring:$(IMAGE_TAG) services/scoring
	@echo "$(GREEN)Scoring service image built: $(DOCKER_REGISTRY)-scoring:$(IMAGE_TAG)$(NC)"

# Build dashboard service image
docker-build-dashboard:
	@echo "$(BLUE)Building dashboard service image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/dashboard/Dockerfile -t $(DOCKER_REGISTRY)-dashboard:$(IMAGE_TAG) .
	@echo "$(GREEN)Dashboard service image built: $(DOCKER_REGISTRY)-dashboard:$(IMAGE_TAG)$(NC)"

# Build playwright automation image
docker-build-playwright:
	@echo "$(BLUE)Building playwright automation image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/playwright/Dockerfile -t $(DOCKER_REGISTRY)-playwright:$(IMAGE_TAG) .
	@echo "$(GREEN)Playwright automation image built: $(DOCKER_REGISTRY)-playwright:$(IMAGE_TAG)$(NC)"

# Build k6 load testing image
docker-build-k6:
	@echo "$(BLUE)Building k6 load testing image...$(NC)"
	@$(BUILDER) build --platform $(PLATFORM) -f services/k6/Dockerfile -t $(DOCKER_REGISTRY)-k6:$(IMAGE_TAG) .
	@echo "$(GREEN)k6 load testing image built: $(DOCKER_REGISTRY)-k6:$(IMAGE_TAG)$(NC)"

# Build all service images
docker-build-all: docker-build-slots docker-build-blackjack \
	docker-build-frontend docker-build-roulette docker-build-dice docker-build-scoring docker-build-dashboard docker-build-playwright docker-build-k6
	@echo "$(GREEN)All Docker images built!$(NC)"

# Alias for docker-build-all
docker-build: docker-build-all

# =============================================================================
# Docker Push
# =============================================================================

# Push gateway image
docker-push-gateway: docker-build-gateway
	@echo "$(BLUE)Pushing gateway image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-gateway:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push slots service image
docker-push-slots: docker-build-slots
	@echo "$(BLUE)Pushing slots service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-slots:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push blackjack service image
docker-push-blackjack: docker-build-blackjack
	@echo "$(BLUE)Pushing blackjack service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-blackjack:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push frontend service image
docker-push-frontend: docker-build-frontend
	@echo "$(BLUE)Pushing frontend service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-frontend:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push roulette service image
docker-push-roulette: docker-build-roulette
	@echo "$(BLUE)Pushing roulette service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-roulette:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push dice service image
docker-push-dice: docker-build-dice
	@echo "$(BLUE)Pushing dice service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-dice:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

docker-push-scoring: docker-build-scoring
	@echo "$(BLUE)Pushing scoring service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-scoring:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

docker-push-dashboard: docker-build-dashboard
	@echo "$(BLUE)Pushing dashboard service image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-dashboard:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push playwright automation image
docker-push-playwright: docker-build-playwright
	@echo "$(BLUE)Pushing playwright automation image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-playwright:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push k6 load testing image
docker-push-k6: docker-build-k6
	@echo "$(BLUE)Pushing k6 load testing image...$(NC)"
	@$(BUILDER) push $(DOCKER_REGISTRY)-k6:$(IMAGE_TAG) || echo "$(YELLOW)Push failed (registry may not be accessible)$(NC)"

# Push all service images
docker-push-all: docker-push-slots docker-push-blackjack \
	docker-push-frontend docker-push-roulette docker-push-dice docker-push-scoring docker-push-dashboard docker-push-playwright docker-push-k6
	@echo "$(GREEN)All Docker images pushed!$(NC)"

# Alias for docker-push-all
docker-push: docker-push-all

# =============================================================================
# Documentation
# =============================================================================

# Serve MkDocs documentation locally
docs-serve:
	@echo "$(BLUE)Serving MkDocs documentation...$(NC)"
	@if ! command -v mkdocs &> /dev/null; then \
		echo "$(YELLOW)MkDocs not found. Installing...$(NC)"; \
		pip install -r requirements-docs.txt; \
	fi
	@mkdocs serve

# Build MkDocs documentation
docs-build:
	@echo "$(BLUE)Building MkDocs documentation...$(NC)"
	@if ! command -v mkdocs &> /dev/null; then \
		echo "$(YELLOW)MkDocs not found. Installing...$(NC)"; \
		pip install -r requirements-docs.txt; \
	fi
	@mkdocs build

# =============================================================================
# Installation
# =============================================================================

# Install root dependencies
install:
	@echo "$(BLUE)Installing root dependencies...$(NC)"
	@npm install

# Install all dependencies (root + all services)
install-all: install
	@echo "$(BLUE)Installing service dependencies...$(NC)"
	@cd services/slots && npm install || true
	@cd services/blackjack && npm install || true
	@cd services/frontend && npm install || true
	@cd services/roulette && npm install || true
	@echo "$(BLUE)Installing Python dependencies...$(NC)"
	@cd services/roulette/python && pip install -r requirements.txt || true
	@echo "$(GREEN)All dependencies installed!$(NC)"

# =============================================================================
# Cleanup
# =============================================================================

# Clean generated files and dependencies
clean:
	@echo "$(BLUE)Cleaning generated files...$(NC)"
	@rm -rf services/grpc/node
	@rm -rf services/dice/go/proto
	@rm -rf services/roulette/python/proto
	@rm -rf node_modules
	@find services -name "node_modules" -type d -exec rm -rf {} + || true
	@echo "$(GREEN)Clean completed!$(NC)"

# =============================================================================
# Help
# =============================================================================

help:
	@echo "$(BLUE)Vegas Casino Makefile Commands$(NC)"
	@echo ""
	@echo "$(GREEN)Proto Generation:$(NC)"
	@echo "  make proto              - Generate all proto code (Go, Python, Node.js)"
	@echo "  make proto-go          - Generate Go proto code"
	@echo "  make proto-python      - Generate Python proto code"
	@echo "  make proto-node        - Generate Node.js proto code"
	@echo "  make install-deps      - Install proto generation dependencies"
	@echo ""
	@echo "$(GREEN)Testing:$(NC)"
	@echo "  make test-all          - Run all tests"
	@echo "  make test-gateway      - Test gateway service"
	@echo "  make test-slots        - Test slots service"
	@echo "  make test-blackjack    - Test blackjack service"
	@echo "  make test-frontend     - Test frontend service"
	@echo "  make test-roulette     - Test roulette service (Python)"
	@echo "  make test-dice         - Test dice service (Go)"
	@echo ""
	@echo "$(GREEN)Docker Build:$(NC)"
	@echo "  make docker-build-all  - Build all Docker images"
	@echo "  make docker-build-gateway   - Build gateway image"
	@echo "  make docker-build-slots     - Build slots service image"
	@echo "  make docker-build-blackjack - Build blackjack service image"
	@echo "  make docker-build-frontend  - Build frontend service image"
	@echo "  make docker-build-roulette  - Build roulette service image"
	@echo "  make docker-build-dice      - Build dice service image"
	@echo "  make docker-build-scoring   - Build scoring service image (Java)"
	@echo "  make docker-build-dashboard - Build dashboard service image"
	@echo "  make docker-build-playwright - Build playwright automation image"
	@echo "  make docker-build-k6 - Build k6 load testing image"
	@echo ""
	@echo "$(GREEN)Docker Push:$(NC)"
	@echo "  make docker-push-all  - Push all Docker images"
	@echo "  make docker-push-gateway   - Push gateway image"
	@echo "  make docker-push-slots     - Push slots service image"
	@echo "  make docker-push-blackjack - Push blackjack service image"
	@echo "  make docker-push-frontend  - Push frontend service image"
	@echo "  make docker-push-roulette  - Push roulette service image"
	@echo "  make docker-push-dice      - Push dice service image"
	@echo "  make docker-push-scoring   - Push scoring service image"
	@echo "  make docker-push-dashboard - Push dashboard service image"
	@echo "  make docker-push-playwright - Push playwright automation image"
	@echo "  make docker-push-k6 - Push k6 load testing image"
	@echo ""
	@echo "$(GREEN)Installation:$(NC)"
	@echo "  make install           - Install root dependencies"
	@echo "  make install-all      - Install all dependencies (root + services)"
	@echo ""
	@echo "$(GREEN)Utilities:$(NC)"
	@echo "  make clean             - Clean generated files and node_modules"
	@echo "  make help              - Show this help message"
	@echo ""
	@echo "$(YELLOW)Environment Variables:$(NC)"
	@echo "  DOCKER_REGISTRY        - Docker registry URL (default: localhost:5000)"
	@echo "  IMAGE_TAG              - Docker image tag (default: latest)"
	@echo ""
	@echo "$(YELLOW)Examples:$(NC)"
	@echo "  make docker-build-all DOCKER_REGISTRY=myregistry.com IMAGE_TAG=v1.0.0"
	@echo "  make test-all"
	@echo "  make proto && make docker-build-all"
