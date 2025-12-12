# Playwright Tests

## Overview

Playwright automation simulates complete user journeys through the Vegas Casino application. It uses a headless browser to interact with the web UI, just like a real user would.

## What Playwright Tests Do

The Playwright test script (`simulate-user.js`) performs the following actions:

1. **Enter Casino**
   - Navigate to frontend
   - Fill in user information (name, email, company)
   - Submit entry form

2. **Play Each Game**
   - Navigate to slots, roulette, dice, and blackjack
   - Place bets
   - Enable feature flags (cheats)
   - Interact with game controls

3. **Deposit Funds**
   - Click deposit button between games
   - Verify balance updates

4. **View Dashboard**
   - Navigate to dashboard
   - View stats for each game
   - Verify data display

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CASINO_URL` | `http://localhost:3000` | Frontend service URL |
| `USER_NAME` | `PlaywrightUser_{timestamp}` | Test user name |
| `USER_EMAIL` | `{username}@example.com` | Test user email |
| `USER_COMPANY` | `Dynatrace` | Test user company |
| `DELAY_BETWEEN_ACTIONS` | `2000` | Milliseconds between actions |
| `DELAY_BETWEEN_GAMES` | `5000` | Milliseconds between games |
| `RUN_CONTINUOUSLY` | `false` | Run in continuous loop |
| `ITERATIONS` | `1` | Number of iterations |

### Helm Configuration

```yaml
playwright:
  enabled: true
  casinoUrl: ""  # Auto-detect if empty
  userName: "PlaywrightUser"
  userEmail: "playwright@example.com"
  userCompany: "Dynatrace"
  delayBetweenActions: "2000"
  delayBetweenGames: "5000"
  runContinuously: "false"
  iterations: "1"
```

## Running Playwright Tests

### Via Helm

```bash
# Enable and deploy
helm upgrade --install vegas-casino ./helm/vegas-casino \
  --set playwright.enabled=true \
  --set playwright.runContinuously=false \
  --set playwright.iterations=5
```

### Via Kubernetes Job

```bash
# Create job manually
kubectl create job playwright-test \
  --from=job/vegas-casino-playwright-1 \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Locally

```bash
# Build image
make docker-build-playwright

# Run locally
docker run --rm \
  -e CASINO_URL=http://localhost:3000 \
  -e USER_NAME=TestUser \
  -e ITERATIONS=1 \
  hrexed/vegasapp-playwright:0.10
```

## Test Flow

```
1. Enter Casino
   ↓
2. Deposit Funds
   ↓
3. Play Slots (with cheats enabled)
   ↓
4. Return to Lobby
   ↓
5. Deposit Funds
   ↓
6. Play Roulette (with cheats enabled)
   ↓
7. Return to Lobby
   ↓
8. Deposit Funds
   ↓
9. Play Dice
   ↓
10. Return to Lobby
    ↓
11. Deposit Funds
    ↓
12. Play Blackjack
    ↓
13. View Dashboard (all games)
    ↓
14. View Dashboard (per game)
```

## Output

Playwright tests output:
- Console logs for each action
- Success/failure indicators
- Error messages if actions fail
- Trace information (if configured)

Example output:
```
🎰 [PlaywrightUser] Entering casino...
✅ [PlaywrightUser] Successfully entered casino
💰 [PlaywrightUser] Depositing funds...
✅ [PlaywrightUser] Deposited funds
🎰 [PlaywrightUser] Playing slots...
🔧 [PlaywrightUser] Enabled cheats for slots
✅ [PlaywrightUser] Finished playing slots
```

## Continuous Testing

To run Playwright continuously:

```yaml
playwright:
  runContinuously: "true"
```

This will run the test in an infinite loop, generating continuous traffic.

## Troubleshooting

### Browser Launch Fails
- Ensure pod has proper security context (SYS_ADMIN capability)
- Check resource limits (Playwright needs memory)

### Page Load Timeouts
- Increase `DELAY_BETWEEN_ACTIONS`
- Check frontend service availability
- Verify CASINO_URL is correct

### Element Not Found
- Check if UI has changed
- Verify selectors in `simulate-user.js`
- Check browser console logs

---

**Next**: Learn about [k6 Load Tests](k6.md) or [Deployment](../deployment/index.md).

