#!/bin/bash

# Vegas Casino Kubernetes Deployment Script
# This script builds Docker images and deploys to Kubernetes

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
REGISTRY="${DOCKER_REGISTRY:-localhost:5000}"  # Change to your registry
NAMESPACE="vegas-casino"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo -e "${GREEN}=== Vegas Casino Kubernetes Deployment ===${NC}\n"

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl is not installed or not in PATH${NC}"
    exit 1
fi

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker is not installed or not in PATH${NC}"
    exit 1
fi

echo -e "${YELLOW}Building Docker images...${NC}"

# Build images
echo "Building gateway image..."
docker build -f services/gateway/Dockerfile -t ${REGISTRY}/vegas-casino-gateway:${IMAGE_TAG} .

echo "Building frontend service image..."
docker build -f services/frontend/Dockerfile -t ${REGISTRY}/vegas-frontend-service:${IMAGE_TAG} .

echo "Building slots service image..."
docker build -f services/slots/Dockerfile -t ${REGISTRY}/vegas-slots-service:${IMAGE_TAG} .

echo "Building roulette service image (Python)..."
docker build -f services/roulette/Dockerfile -t ${REGISTRY}/vegas-roulette-service:${IMAGE_TAG} .

echo "Building dice service image (Go)..."
docker build -f services/dice/Dockerfile -t ${REGISTRY}/vegas-dice-service:${IMAGE_TAG} .

echo "Building blackjack service image..."
docker build -f services/blackjack/Dockerfile -t ${REGISTRY}/vegas-blackjack-service:${IMAGE_TAG} .

# Push images (if not using local registry, uncomment these)
# echo -e "${YELLOW}Pushing images to registry...${NC}"
# docker push ${REGISTRY}/vegas-casino-gateway:${IMAGE_TAG}
# docker push ${REGISTRY}/vegas-frontend-service:${IMAGE_TAG}
# docker push ${REGISTRY}/vegas-slots-service:${IMAGE_TAG}
# docker push ${REGISTRY}/vegas-roulette-service:${IMAGE_TAG}
# docker push ${REGISTRY}/vegas-dice-service:${IMAGE_TAG}
# docker push ${REGISTRY}/vegas-blackjack-service:${IMAGE_TAG}

echo -e "${YELLOW}Deploying to Kubernetes...${NC}"

# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply ConfigMap
kubectl apply -f k8s/configmap.yaml

# Update image references in deployments (if using custom registry)
if [ "$REGISTRY" != "localhost:5000" ]; then
    echo "Updating image references to ${REGISTRY}..."
    sed "s|image: vegas-|image: ${REGISTRY}/vegas-|g" k8s/slots-deployment.yaml | kubectl apply -f -
    sed "s|image: vegas-|image: ${REGISTRY}/vegas-|g" k8s/roulette-deployment.yaml | kubectl apply -f -
    sed "s|image: vegas-|image: ${REGISTRY}/vegas-|g" k8s/dice-deployment.yaml | kubectl apply -f -
    sed "s|image: vegas-|image: ${REGISTRY}/vegas-|g" k8s/blackjack-deployment.yaml | kubectl apply -f -
    sed "s|image: vegas-|image: ${REGISTRY}/vegas-|g" k8s/gateway-deployment.yaml | kubectl apply -f -
    sed "s|image: vegas-|image: ${REGISTRY}/vegas-|g" k8s/frontend-deployment.yaml | kubectl apply -f - 2>/dev/null || true
else
    # Apply deployments with default images
    kubectl apply -f k8s/slots-deployment.yaml
    kubectl apply -f k8s/roulette-deployment.yaml
    kubectl apply -f k8s/dice-deployment.yaml
    kubectl apply -f k8s/blackjack-deployment.yaml
    kubectl apply -f k8s/gateway-deployment.yaml
    kubectl apply -f k8s/frontend-deployment.yaml 2>/dev/null || true
fi

# Apply Ingress (optional)
if [ "$1" == "--with-ingress" ]; then
    echo "Applying Ingress configuration..."
    kubectl apply -f k8s/ingress.yaml
fi

echo -e "\n${GREEN}Deployment complete!${NC}"
echo -e "\n${YELLOW}Waiting for pods to be ready...${NC}"
kubectl wait --for=condition=ready pod -l app=vegas-casino-gateway -n ${NAMESPACE} --timeout=120s || true

echo -e "\n${GREEN}=== Deployment Status ===${NC}"
kubectl get pods -n ${NAMESPACE}
kubectl get services -n ${NAMESPACE}

echo -e "\n${YELLOW}To access the application:${NC}"
echo "  kubectl port-forward -n ${NAMESPACE} svc/vegas-casino-gateway 8080:80"
echo "  Then open http://localhost:8080 in your browser"

