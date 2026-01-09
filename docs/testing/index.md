# Testing Overview

The Vegas Casino project includes two types of automated testing:

1. **Playwright** - End-to-end browser automation
2. **k6** - Load and performance testing

Both testing tools are containerized and can be deployed as Kubernetes Jobs or run locally.

## Testing Strategy

### Playwright Tests
- **Purpose**: Simulate real user journeys
- **Scope**: Full application flow from entry to dashboard
- **Execution**: Continuous or one-time runs
- **Output**: Console logs and traces

### k6 Load Tests
- **Purpose**: Performance and scalability testing
- **Scope**: API endpoints under load
- **Execution**: Configurable duration and virtual users
- **Output**: Performance metrics and statistics

## Test Coverage

```mermaid
flowchart TD
    Start([Test Start]) --> Enter[Enter Casino]
    Enter --> Deposit1[Deposit Funds]
    Deposit1 --> PlaySlots[Play Slots<br/>+ Enable Cheats]
    PlaySlots --> Lobby1[Return to Lobby]
    Lobby1 --> Deposit2[Deposit Funds]
    Deposit2 --> PlayRoulette[Play Roulette<br/>+ Enable Cheats]
    PlayRoulette --> Lobby2[Return to Lobby]
    Lobby2 --> Deposit3[Deposit Funds]
    Deposit3 --> PlayDice[Play Dice]
    PlayDice --> Lobby3[Return to Lobby]
    Lobby3 --> Deposit4[Deposit Funds]
    Deposit4 --> PlayBlackjack[Play Blackjack]
    PlayBlackjack --> ViewDashboard[View Dashboard]
    ViewDashboard --> CheckStats[Check Statistics]
    CheckStats --> End([Test Complete])
    
    style Start fill:#10b981,stroke:#059669,color:#fff
    style End fill:#10b981,stroke:#059669,color:#fff
    style PlaySlots fill:#f59e0b,stroke:#d97706,color:#fff
    style PlayRoulette fill:#f59e0b,stroke:#d97706,color:#fff
    style ViewDashboard fill:#9333ea,stroke:#7c3aed,color:#fff
```

Both test suites cover:

- ✅ User registration and entry
- ✅ Game selection and play
- ✅ Feature flag activation
- ✅ Deposit functionality
- ✅ Dashboard viewing

## Running Tests

### Playwright
```bash
# Via Helm (as Job)
helm upgrade --install vegas-casino ./helm/vegas-casino \
  --set playwright.enabled=true

# Or manually
kubectl apply -f helm/vegas-casino/templates/playwright-deployment.yaml
```

### k6
```bash
# Via Helm (as Job)
helm upgrade --install vegas-casino ./helm/vegas-casino \
  --set k6.enabled=true

# Or manually
kubectl apply -f helm/vegas-casino/templates/k6-deployment.yaml
```

---

**Next**: Learn about [Playwright Tests](playwright.md) or [k6 Load Tests](k6.md).

