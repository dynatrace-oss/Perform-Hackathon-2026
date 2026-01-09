/**
 * k6 Load Test for Vegas Casino
 * Simulates user journey:
 * - Enter casino with user information
 * - Select and play a game
 * - Enable feature flags
 * - Click deposit
 * - Check dashboard
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Configuration from environment variables
const CASINO_URL = __ENV.CASINO_URL || __ENV.FRONTEND_URL || 'http://localhost:3000';
const VUS = parseInt(__ENV.VUS || '10'); // Virtual Users
const DURATION = __ENV.DURATION || '5m'; // Test duration
const RAMP_UP = __ENV.RAMP_UP || '30s'; // Ramp-up time

// Validate CASINO_URL
if (!CASINO_URL || CASINO_URL.trim() === '') {
  console.error('❌ ERROR: CASINO_URL or FRONTEND_URL environment variable is required!');
  console.error('   Please set CASINO_URL to the frontend service URL (e.g., http://vegas-casino-frontend:3000)');
  throw new Error('CASINO_URL environment variable is required');
}

// Custom metrics
const errorRate = new Rate('errors');
const successRate = new Rate('success');

// Test options
export const options = {
  stages: [
    { duration: RAMP_UP, target: VUS }, // Ramp up to VUS
    { duration: DURATION, target: VUS }, // Stay at VUS
    { duration: '30s', target: 0 }, // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // 95% of requests should be below 2s
    http_req_failed: ['rate<0.1'], // Error rate should be less than 10%
    errors: ['rate<0.1'],
    success: ['rate>0.9'],
  },
};

// Helper function to generate random user data
function generateUserData() {
  const timestamp = Date.now();
  const randomId = Math.floor(Math.random() * 10000);
  return {
    username: `k6user_${timestamp}_${randomId}`,
    email: `k6user_${timestamp}_${randomId}@example.com`,
    company: 'Dynatrace',
  };
}

// Helper function to get cookies from response
function getCookies(response) {
  const cookies = {};
  if (response.headers['Set-Cookie']) {
    const cookieHeader = Array.isArray(response.headers['Set-Cookie'])
      ? response.headers['Set-Cookie']
      : [response.headers['Set-Cookie']];
    
    cookieHeader.forEach(cookie => {
      const parts = cookie.split(';')[0].split('=');
      if (parts.length === 2) {
        cookies[parts[0].trim()] = parts[1].trim();
      }
    });
  }
  return cookies;
}

// Helper function to build cookie string
function buildCookieString(cookies) {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/**
 * Enter the casino with user information
 */
function enterCasino(casinoUrl, userData) {
  const url = `${casinoUrl}/`;
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
    },
  };

  // First, get the landing page
  let response = http.get(url, params);
  const success = check(response, {
    'landing page loaded': (r) => r.status === 200,
  });
  if (!success) {
    errorRate.add(1);
    return { success: false, cookies: {} };
  }

  // Extract cookies from initial request
  let cookies = getCookies(response);

  // Submit user information to enter casino
  const enterUrl = `${casinoUrl}/api/user/init`;
  const payload = JSON.stringify({
    Username: userData.username,
    CustomerName: userData.username,
    Email: userData.email,
    CompanyName: userData.company,
    Persona: 'player',
    Booth: 'standard',
  });

  const enterParams = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
      ...(Object.keys(cookies).length > 0 ? { 'Cookie': buildCookieString(cookies) } : {}),
    },
  };

  response = http.post(enterUrl, payload, enterParams);
  cookies = { ...cookies, ...getCookies(response) };

  const enterSuccess = check(response, {
    'entered casino successfully': (r) => r.status === 200 || r.status === 201,
  });

  if (enterSuccess) {
    successRate.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    successRate.add(0);
  }

  return { success: enterSuccess, cookies, userData };
}

/**
 * Deposit funds
 */
function depositFunds(casinoUrl, cookies, userData) {
  const url = `${casinoUrl}/api/user/topup`;
  // Ensure deposit amount is > 0
  const depositAmount = Math.max(100, 1000); // Minimum 100, default 1000
  const payload = JSON.stringify({
    Username: userData.username,
    Amount: depositAmount,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
      ...(Object.keys(cookies).length > 0 ? { 'Cookie': buildCookieString(cookies) } : {}),
    },
  };

  const response = http.post(url, payload, params);
  const success = check(response, {
    'deposit successful': (r) => r.status === 200 || r.status === 201,
    'balance updated': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.balance !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successRate.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    successRate.add(0);
  }

  return success;
}

/**
 * Play a game (slots, roulette, dice, or blackjack)
 */
function playGame(casinoUrl, cookies, userData, gameName) {
  let url, payload, method;
  
  // Ensure bet amounts are always > 0 (minimum 10)
  const minBet = 10;
  const getBetAmount = (desiredBet) => Math.max(minBet, desiredBet || minBet);

  switch (gameName) {
    case 'slots':
      // Use HTTP endpoint - frontend service uses gRPC internally to call slots service
      // Architecture: Browser → HTTP → Frontend Service → gRPC → Slots Service
      url = `${casinoUrl}/api/slots/spin`;
      payload = JSON.stringify({
        Username: userData.username,
        BetAmount: getBetAmount(50), // Ensure bet is always > 0 (minimum 10)
        CheatActive: true, // Enable feature flag
        CheatType: 'symbolControl',
      });
      method = 'POST';
      break;

    case 'roulette':
      // Use HTTP endpoint - frontend service uses gRPC internally to call roulette service
      // Architecture: Browser → HTTP → Frontend Service → gRPC → Roulette Service
      url = `${casinoUrl}/api/games/roulette/spin`;
      payload = JSON.stringify({
        Username: userData.username,
        BetAmount: getBetAmount(100), // Ensure bet is always > 0 (minimum 10)
        BetType: 'red',
        CheatActive: true, // Enable feature flag
        CheatType: 'ballControl',
      });
      method = 'POST';
      break;

    case 'dice':
      // Use HTTP endpoint - frontend service uses gRPC internally to call dice service
      // Architecture: Browser → HTTP → Frontend Service → gRPC → Dice Service
      url = `${casinoUrl}/api/dice/roll`;
      payload = JSON.stringify({
        Username: userData.username,
        BetAmount: getBetAmount(75), // Ensure bet is always > 0 (minimum 10)
        BetType: 'pass',
      });
      method = 'POST';
      break;

    case 'blackjack':
      // Use HTTP endpoint - frontend service uses gRPC internally to call blackjack service
      // Architecture: Browser → HTTP → Frontend Service → gRPC → Blackjack Service
      url = `${casinoUrl}/api/games/blackjack/deal`;
      payload = JSON.stringify({
        Username: userData.username,
        BetAmount: getBetAmount(80), // Ensure bet is always > 0 (minimum 10)
      });
      method = 'POST';
      break;

    default:
      return false;
  }

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
      ...(Object.keys(cookies).length > 0 ? { 'Cookie': buildCookieString(cookies) } : {}),
    },
  };

  const response = http.request(method, url, payload, params);
  const success = check(response, {
    [`${gameName} game played`]: (r) => r.status === 200 || r.status === 201,
    'game response valid': (r) => {
      try {
        const body = JSON.parse(r.body);
        // For blackjack, check for response format (can be snake_case from gRPC or camelCase)
        if (gameName === 'blackjack') {
          return body !== null && (body.player_hand !== undefined || body.playerHand !== undefined || body.player_score !== undefined || body.playerScore !== undefined);
        }
        return body !== null;
      } catch {
        return false;
      }
    },
    'bet amount valid': (r) => {
      try {
        const body = JSON.parse(r.body);
        // Ensure bet amount in response is > 0 (if present)
        // Handle both snake_case (from gRPC) and camelCase formats
        if (body.bet_amount !== undefined) {
          return body.bet_amount > 0;
        }
        if (body.betAmount !== undefined) {
          return body.betAmount > 0;
        }
        return true; // If bet amount not in response, assume valid
      } catch {
        return true; // If parsing fails, don't fail this check
      }
    },
  });

  if (success) {
    successRate.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    successRate.add(0);
  }

  return success;
}

/**
 * Check dashboard stats
 */
function checkDashboard(casinoUrl, cookies, gameName = 'all') {
  // Dashboard service endpoint (not frontend)
  // Try dashboard service directly, or via frontend proxy
  let url;
  if (gameName === 'all') {
    url = `${casinoUrl}/api/dashboard`;
  } else {
    url = `${casinoUrl}/api/dashboard/${gameName}`;
  }
  
  const params = {
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'k6-load-test/1.0',
      'Accept': 'application/json',
      ...(Object.keys(cookies).length > 0 ? { 'Cookie': buildCookieString(cookies) } : {}),
    },
  };

  const response = http.get(url, params);
  const success = check(response, {
    'dashboard loaded': (r) => r.status === 200,
    'dashboard has data': (r) => {
      try {
        const body = JSON.parse(r.body);
        // Dashboard can return { stats: [...] } or { game: "...", stats: {...} }
        return body.stats !== undefined || body.game !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successRate.add(1);
    errorRate.add(0);
  } else {
    errorRate.add(1);
    successRate.add(0);
  }

  return success;
}

/**
 * Main test function - executed by each virtual user
 */
export default function () {
  const userData = generateUserData();
  const games = ['slots', 'roulette', 'dice', 'blackjack'];
  const selectedGame = games[Math.floor(Math.random() * games.length)];

  // Step 1: Enter casino
  const enterResult = enterCasino(CASINO_URL, userData);
  if (!enterResult.success) {
    return;
  }
  sleep(1);

  // Step 2: Deposit funds
  const depositSuccess = depositFunds(CASINO_URL, enterResult.cookies, userData);
  if (!depositSuccess) {
    return;
  }
  sleep(1);

  // Step 3: Play a game (with feature flag enabled)
  const playSuccess = playGame(CASINO_URL, enterResult.cookies, userData, selectedGame);
  if (!playSuccess) {
    return;
  }
  sleep(1);

  // Step 4: Deposit again
  depositFunds(CASINO_URL, enterResult.cookies, userData);
  sleep(1);

  // Step 5: Check dashboard for all games
  checkDashboard(CASINO_URL, enterResult.cookies, 'all');
  sleep(1);

  // Step 6: Check dashboard for specific game
  checkDashboard(CASINO_URL, enterResult.cookies, selectedGame);
  sleep(1);
}

/**
 * Setup function - runs once before all VUs
 */
export function setup() {
  console.log(`🚀 Starting k6 load test for Vegas Casino`);
  console.log(`   Casino URL: ${CASINO_URL}`);
  console.log(`   Virtual Users: ${VUS}`);
  console.log(`   Duration: ${DURATION}`);
  console.log(`   Ramp-up: ${RAMP_UP}`);
  return { casinoUrl: CASINO_URL };
}

/**
 * Teardown function - runs once after all VUs finish
 */
export function teardown(data) {
  console.log(`✅ k6 load test completed`);
}

