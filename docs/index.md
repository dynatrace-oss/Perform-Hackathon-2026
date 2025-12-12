# Vegas Casino - Observability Hackathon

Welcome to the **Vegas Casino** project documentation! This is a microservices-based casino application designed specifically for observability hackathons where attendees will improve instrumentation and application pipelines.

## 🎰 What is Vegas Casino?

Vegas Casino is a comprehensive microservices application that simulates a real-world casino environment. It's built with multiple services using different programming languages and technologies, making it an ideal platform for:

- **Observability Practice**: Learn and implement distributed tracing, metrics, and logging
- **Feature Flag Management**: Experiment with OpenFeature and flagd for feature toggling
- **Load Testing**: Test application performance under various conditions
- **DevOps Practices**: Practice CI/CD, containerization, and Kubernetes deployment

## 🚀 Quick Start

```bash
# Build all Docker images
make docker-build-all

# Deploy using Helm
helm install vegas-casino ./helm/vegas-casino

# Run Playwright automation
kubectl apply -f helm/vegas-casino/templates/playwright-deployment.yaml

# Run k6 load tests
kubectl apply -f helm/vegas-casino/templates/k6-deployment.yaml
```

## 📚 Documentation Sections

- **[Overview](overview/index.md)** - Learn about the project and hackathon context
- **[Architecture](architecture/index.md)** - Understand the system design and components
- **[Development](development/building.md)** - Build and generate Docker images
- **[Testing](testing/index.md)** - Playwright and k6 testing guides
- **[Deployment](deployment/index.md)** - Deploy to Kubernetes with Helm or manifests

## 🎯 Key Features

- **Multi-Language Services**: Node.js, Python, Go, and Java
- **Feature Flags**: OpenFeature with flagd sidecar injection
- **Distributed Tracing**: OpenTelemetry with gRPC export
- **Load Testing**: k6 and Playwright automation
- **Observability**: Comprehensive logging, metrics, and traces

## 🛠️ Technology Stack

- **Frontend**: Node.js/Express
- **Game Services**: Node.js, Python, Go
- **Scoring Service**: Java/Spring Boot
- **Feature Flags**: OpenFeature Operator + flagd
- **Observability**: OpenTelemetry
- **Orchestration**: Kubernetes + Helm

---

**Ready to get started?** Check out the [Project Overview](overview/index.md) or jump to [Building the Project](development/building.md)!




