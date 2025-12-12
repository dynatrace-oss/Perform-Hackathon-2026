# Kubernetes Deployment Guide

This directory contains Kubernetes manifests for deploying the Vegas Casino microservices application.

## Architecture

The application is deployed as:
- **1 Gateway Service** (API Gateway + Web UI)
- **4 Microservices** (Slots, Roulette, Dice, Blackjack)
- Each service runs in its own Deployment with 2 replicas
- Services communicate via Kubernetes Service DNS names

## Prerequisites

- Kubernetes cluster (v1.19+)
- kubectl configured to access your cluster
- Docker (for building images)
- Docker registry (optional, for image storage)

## Quick Start

### 1. Build and Deploy

```bash
# Make deploy script executable
chmod +x k8s/deploy.sh

# Deploy everything
./k8s/deploy.sh

# Or deploy with Ingress
./k8s/deploy.sh --with-ingress
```

### 2. Manual Deployment

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Apply ConfigMap
kubectl apply -f k8s/configmap.yaml

# Deploy services
kubectl apply -f k8s/slots-deployment.yaml
kubectl apply -f k8s/roulette-deployment.yaml
kubectl apply -f k8s/dice-deployment.yaml
kubectl apply -f k8s/blackjack-deployment.yaml
kubectl apply -f k8s/gateway-deployment.yaml

# Optional: Deploy Ingress
kubectl apply -f k8s/ingress.yaml
```

## Configuration

### Environment Variables

Edit `k8s/configmap.yaml` to customize:
- `DEPLOYMENT_ENVIRONMENT`: Deployment environment (OpenTelemetry standard)
- `OTEL_SERVICE_VERSION`: Service version (OpenTelemetry standard)
- `K8S_CLUSTER_NAME`: Kubernetes cluster name
- `SERVICE_NAMESPACE`: Service namespace
- `OTEL_RESOURCE_ATTRIBUTES`: OpenTelemetry resource attributes (comma-separated key=value pairs)

Note: Legacy `DT_*` variables are kept for backward compatibility but should be migrated to OpenTelemetry equivalents.

### Image Registry

To use a custom Docker registry, set the `DOCKER_REGISTRY` environment variable:

```bash
export DOCKER_REGISTRY=your-registry.com
export IMAGE_TAG=v1.0.0
./k8s/deploy.sh
```

Or edit the image references in the deployment YAML files directly.

### Scaling

To scale services, edit the `replicas` field in each deployment:

```bash
kubectl scale deployment vegas-slots-service --replicas=3 -n vegas-casino
```

Or use the `kubectl scale` command:

```bash
kubectl scale deployment vegas-slots-service --replicas=3 -n vegas-casino
kubectl scale deployment vegas-roulette-service --replicas=3 -n vegas-casino
```

## Accessing the Application

### Port Forwarding (Development)

```bash
kubectl port-forward -n vegas-casino svc/vegas-casino-gateway 8080:80
```

Then open http://localhost:8080 in your browser.

### LoadBalancer (Cloud)

If your cluster supports LoadBalancer services, the gateway service will get an external IP:

```bash
kubectl get svc -n vegas-casino vegas-casino-gateway
```

### Ingress

If you deployed with Ingress, configure your domain in `k8s/ingress.yaml` and access via:

```
http://vegas-casino.example.com
```

## Monitoring

### Check Pod Status

```bash
kubectl get pods -n vegas-casino
```

### View Logs

```bash
# Gateway logs
kubectl logs -n vegas-casino -l app=vegas-casino-gateway

# Slots service logs
kubectl logs -n vegas-casino -l app=vegas-slots-service

# All services
kubectl logs -n vegas-casino --all-containers=true -f
```

### Health Checks

Each service exposes a `/health` endpoint. Check health:

```bash
# Gateway
kubectl exec -n vegas-casino deployment/vegas-casino-gateway -- wget -qO- http://localhost:8080/api/health

# Slots service
kubectl exec -n vegas-casino deployment/vegas-slots-service -- wget -qO- http://localhost:8081/health
```

## Service Discovery

Services communicate using Kubernetes DNS names:
- `vegas-slots-service:8081`
- `vegas-roulette-service:8082`
- `vegas-dice-service:8083`
- `vegas-blackjack-service:8084`

The gateway automatically uses these service names when running in Kubernetes.

## Dynatrace Integration

Each service is configured with Dynatrace metadata:
- Process Group IDs
- Service Names
- Application Names
- Environment tags
- Custom properties

The OneAgent will automatically discover and instrument each service.

## Troubleshooting

### Pods Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name> -n vegas-casino

# Check pod logs
kubectl logs <pod-name> -n vegas-casino
```

### Services Not Accessible

```bash
# Check service endpoints
kubectl get endpoints -n vegas-casino

# Test service connectivity
kubectl run -it --rm debug --image=busybox --restart=Never -- nslookup vegas-slots-service
```

### Image Pull Errors

If using a private registry, create a secret:

```bash
kubectl create secret docker-registry regcred \
  --docker-server=<registry-url> \
  --docker-username=<username> \
  --docker-password=<password> \
  -n vegas-casino
```

Then add to deployments:

```yaml
spec:
  template:
    spec:
      imagePullSecrets:
      - name: regcred
```

## Cleanup

To remove all resources:

```bash
kubectl delete namespace vegas-casino
```

Or delete individual resources:

```bash
kubectl delete -f k8s/
```

## Resource Requirements

Each service has resource requests and limits:
- **Microservices**: 128Mi-256Mi memory, 100m-500m CPU
- **Gateway**: 256Mi-512Mi memory, 200m-1000m CPU

Adjust these in the deployment YAML files based on your cluster capacity.

## High Availability

- Each service runs with 2 replicas by default
- Services use readiness and liveness probes
- Kubernetes automatically restarts failed pods
- Load balancing across replicas via Service

## Security

For production deployments, consider:
- Using Secrets for sensitive data
- Enabling network policies
- Using TLS/HTTPS (configure in Ingress)
- Implementing RBAC policies
- Using Pod Security Policies

