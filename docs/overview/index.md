# Project Overview

## What is Vegas Casino?

Vegas Casino is a microservices-based casino application designed specifically for **observability hackathons**. The project provides a realistic, production-like environment where attendees can practice and improve:

- **Distributed Tracing**: End-to-end trace correlation across services
- **Feature Flag Management**: OpenFeature integration with flagd
- **Observability Pipelines**: OpenTelemetry instrumentation and export
- **Performance Testing**: Load testing with k6 and automation with Playwright
- **DevOps Practices**: Containerization, Kubernetes deployment, and CI/CD

## Project Goals

The primary goal of this project is to provide a **hands-on learning environment** for observability practitioners. Attendees will:

1. **Improve Instrumentation**: Add and enhance OpenTelemetry spans across services
2. **Optimize Pipelines**: Configure and tune observability data pipelines
3. **Implement Feature Flags**: Integrate and manage feature flags using OpenFeature
4. **Enhance Testing**: Create and run load tests and automation scripts
5. **Practice Deployment**: Deploy and manage the application in Kubernetes

## Application Structure

The Vegas Casino consists of:

- **4 Game Services**: Slots, Roulette, Dice, and Blackjack
- **Frontend Service**: Web UI for players
- **Scoring Service**: Leaderboards and game statistics
- **Dashboard Service**: Analytics and reporting
- **Supporting Services**: Redis, PostgreSQL, OpenTelemetry Collector

## Why This Project?

This project is designed to simulate **real-world challenges**:

- ✅ Multiple programming languages (Node.js, Python, Go, Java)
- ✅ Different communication patterns (HTTP, gRPC)
- ✅ Complex data flows (frontend → games → scoring → database)
- ✅ Feature flag integration across services
- ✅ Distributed tracing requirements
- ✅ Performance and load testing scenarios

---

**Next**: Learn about the [Hackathon Context](hackathon.md) or explore the [Architecture](../architecture/index.md).

