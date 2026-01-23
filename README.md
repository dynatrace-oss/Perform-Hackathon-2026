# 🎰 Vegas Casino - Observability Hackathon

> ## 📖 **[👉 Open Hackathon Documentation Website](https://dynatrace-oss.github.io/Perform-Hackathon-2026) 👈**
> 
> **All hackathon instructions, challenges, and guides are available on our GitHub Pages website!**

---

## What is This Hackathon?

The **Vegas Casino Observability Hackathon** is a hands-on learning experience where you'll:

- 🚀 **Learn GitHub Copilot**: Master AI-assisted development with GitHub Copilot
- 📊 **Improve Observability**: Enhance OpenTelemetry instrumentation using Copilot
- 🔍 **Work with Dynatrace**: Query data, create dashboards, and build custom apps
- 🎯 **Practice Real-World Skills**: Work with microservices, Kubernetes, and feature flags

## 🚀 Quick Start

### 1. Fork This Repository

Fork [this repository](https://github.com/dynatrace-oss/Perform-Hackathon-2026) to your GitHub account.

### 2. Launch Your Codespace

The hackathon runs entirely in a **GitHub Codespace** (or local DevContainer) that provides:

- ✅ Pre-configured development environment
- ✅ Kubernetes cluster (kind) running locally
- ✅ All operators pre-installed (OpenFeature, Cert-Manager, Gateway API, Dynatrace Operator)
- ✅ Complete application stack ready to deploy

**Launch from GitHub**: Click the green "Code" button → "Codespaces" → "Create codespace on main"

### 3. Start the Hackathon

Visit the **[Hackathon Documentation Website](https://dynatrace-oss.github.io/Perform-Hackathon-2026)** to:
- View all challenges organized by track
- Follow step-by-step instructions
- Access detailed guides and resources

## 🏗️ Architecture Overview

The Vegas Casino is a **microservices-based application** designed for observability practice:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Service                         │
│                  (Node.js/Express)                          │
│                  Port: 3000 (HTTP)                          │
└──────────────┬──────────────────────────────────────────────┘
               │
               ├────────────────────────────────────┐
               │                                    │
               ▼                                    ▼
    ┌──────────────────┐                  ┌───────────────────┐
    │  Game Services   │                  │  Dashboard Service│
    │                  │                  │  (Node.js)        │
    │  • Slots (Node)  │                  │  Port: 3001       │
    │  • Roulette (Py) │                  └────────┬──────────┘
    │  • Dice (Go)     │                           │
    │  • Blackjack (N) │                           │
    │                  │                           │
    │  + flagd sidecar │                           │
    │  + OpenTelemetry │                           │
    └────────┬─────────┘                           │
             │                                     │
             │                                     │
             ▼                                     ▼
    ┌──────────────────┐                  ┌──────────────────┐
    │   Redis Cache    │                  │ Scoring Service  │
    │   (State Store)  │                  │  (Java/Spring)   │
    │   Port: 6379     │                  │  Port: 8085      │
    └──────────────────┘                  └────────┬─────────┘
                                                   │
                                                   ▼
                                          ┌──────────────────┐
                                          │   PostgreSQL     │
                                          │   (Database)     │
                                          │   Port: 5432     │
                                          └──────────────────┘
```

### Key Components

- **4 Game Services**: Slots (Node.js), Roulette (Python), Dice (Go), Blackjack (Node.js)
- **Frontend Service**: Web UI for players (Node.js/Express)
- **Scoring Service**: Leaderboards and statistics (Java/Spring Boot)
- **Dashboard Service**: Analytics and reporting (Node.js)
- **Data Stores**: Redis (sessions, state) and PostgreSQL (persistent data)
- **Observability**: OpenTelemetry Collectors → Dynatrace Operator → Dynatrace Tenant

### Communication Patterns

- **gRPC**: Primary communication between frontend and game services
- **HTTP**: REST APIs for dashboard and scoring
- **Redis**: Direct connections for state management
- **PostgreSQL**: Database connections for persistent storage

## 💻 Development Environment (Codespace)

The hackathon environment runs in a **GitHub Codespace** with everything pre-configured:

### What's Included

- **Kind Kubernetes Cluster**: Local Kubernetes cluster for deployment
- **OpenFeature Operator**: Automatic feature flag management
- **Cert-Manager**: TLS certificate management
- **Kubernetes Gateway API**: Modern ingress and routing
- **Dynatrace Operator**: Observability integration
- **OpenTelemetry Collectors**: Telemetry data processing
- **All Tools**: kubectl, Helm, Terraform, Docker-in-Docker

### Automatic Setup

When your Codespace launches, it automatically:
1. Creates the kind cluster
2. Installs all operators
3. Deploys the Vegas Casino application
4. Configures Dynatrace monitoring

**No manual setup required!** Everything is ready to use.

## 🔄 Development Workflow

!!! important "Important: Building Images"

    **You don't build images locally!** All Docker images are built automatically via GitHub Actions when you:
    
    1. Make code changes in your forked repository
    2. Commit and push your changes
    3. GitHub Actions automatically builds new Docker images
    4. Update your Helm deployment to use the new images

### Making Changes

1. **Edit Source Code** in `services/` directory
2. **Commit and Push** to your fork
3. **GitHub Actions** builds Docker images automatically
4. **Update Helm** deployment with new images

See the [Development Guide](https://dynatrace-oss.github.io/Perform-Hackathon-2026/development/source-code/) for details.

## 🚩 Feature Flags

The application uses **OpenFeature** with **flagd** for feature flag management:

- **Game-specific flags**: Control features per game (progressive jackpot, bonus rounds, etc.)
- **Casino-wide flags**: House advantage mode (reduces win probability)
- **Dynamic updates**: Change flags without redeploying services

See the [Feature Flags Guide](https://dynatrace-oss.github.io/Perform-Hackathon-2026/development/feature-flags/) for details.

## 📚 Documentation

### 📖 **[👉 Full Documentation Website](https://dynatrace-oss.github.io/Perform-Hackathon-2026) 👈**

The complete documentation includes:

- **Hackathon Challenges**: All challenges organized by track (GitHub Copilot, Dynatrace, Bonus)
- **Environment Setup**: DevContainer and Codespace details
- **Development Guides**: Source code locations, GitHub Actions, Helm updates
- **Architecture**: System design and component details
- **Feature Flags**: Complete feature flag documentation

### Local Documentation

To serve documentation locally:

```bash
# Install dependencies
pip install mkdocs-material pymdown-extensions mkdocs-git-revision-date-localized-plugin

# Serve locally
mkdocs serve

# Access at http://127.0.0.1:8000
```

## 🎯 Hackathon Challenges

The hackathon is organized into tracks:

### GitHub Copilot Track
- Introduction to GitHub Copilot
- Best Practices When Using Copilot
- Extending GitHub Copilot with Model Context Protocol

### Dynatrace Track
- Launching your Environment
- Prompt your observability data
- Improve your OpenTelemetry instrumentation
- Improve your Dynatrace Setup

### Bonus Challenges (Optional)
- Customizing GitHub Copilot in Your IDE
- Convert B-MAD Agent to GitHub Copilot Agent
- Build a Custom Dynatrace App

**👉 [View All Challenges on the Documentation Website](https://dynatrace-oss.github.io/Perform-Hackathon-2026/overview/hackathon-index/)**

## 📊 Learning Path

The recommended learning path follows this sequence:

```mermaid
graph LR
    A[Fork Repository] --> B[GitHub Copilot<br/>Challenge 01]
    B --> C[Challenge 02]
    C --> D[Challenge 03]
    D --> F[Dynatrace<br/>Challenge 00]
    F --> G[Challenge 01]
    G --> H[Challenge 02]
    H --> I[Challenge 03]
    I --> J[Bonus Challenges]
    J --> K[Challenge 04<br/>Copilot]
    J --> M[Challenge 05<br/>B-MAD Agent]
    J --> L[Challenge 04<br/>Dynatrace]
    
    style A fill:#9333ea
    style F fill:#06b6d4
    style J fill:#f59e0b
    style K fill:#10b981
    style M fill:#10b981
    style L fill:#10b981
```

## 🛠️ Technology Stack

- **Languages**: Node.js, Python, Go, Java
- **Frameworks**: Express.js, Flask, Spring Boot
- **Databases**: Redis, PostgreSQL
- **Observability**: OpenTelemetry, Dynatrace
- **Feature Flags**: OpenFeature, flagd
- **Orchestration**: Kubernetes, Helm
- **Infrastructure**: Kind, GitHub Codespaces

## 📝 License

This project is designed for educational and hackathon purposes.

## 🤝 Contributing

This repository is used for hackathons. For contributions, please see the [Contributing Guide](https://dynatrace-oss.github.io/Perform-Hackathon-2026/contributing/) on the documentation website.

---

## 🎓 Get Started Now!

1. **Fork the repository** to your GitHub account
2. **Launch a Codespace** from your fork
3. **Visit the [Documentation Website](https://dynatrace-oss.github.io/Perform-Hackathon-2026)** to start the hackathon
4. **Begin with Challenge 01** - Introduction to GitHub Copilot

**👉 [Open Hackathon Documentation](https://dynatrace-oss.github.io/Perform-Hackathon-2026) 👈**
