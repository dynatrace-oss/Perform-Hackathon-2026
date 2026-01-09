/**
 * Frontend Service - gRPC-based game rendering service
 * Aggregates game assets from all microservices and provides unified frontend
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { createClient } = require('./grpc-clients');
const { createClient: createRedisClient } = require('redis');
const { initializeOpenFeature, getFeatureFlag } = require('./common/openfeature');
const { initializeTelemetry, trace } = require('./common/opentelemetry');
const Logger = require('./common/logger');

// Initialize OpenTelemetry first
initializeTelemetry('vegas-frontend-service', {
  version: '2.1.0',
  gameType: 'frontend',
  gameCategory: 'ui',
  complexity: 'medium',
  rtp: 'N/A',
  owner: 'Frontend-Team',
  technology: 'Node.js-Express-Frontend',
  maxPayout: 'N/A'
});

const app = express();

// Middleware to extract trace context from incoming requests
// Auto-instrumentation will create HTTP spans automatically, we just need to extract context
const { context, propagation } = require('@opentelemetry/api');
app.use((req, res, next) => {
  // Extract trace context from incoming request headers (W3C TraceContext format)
  // This ensures all spans created in route handlers are part of the same trace
  const extractedContext = propagation.extract(context.active(), req.headers);
  
  // Run the request handler in the extracted context
  // Auto-instrumentation will automatically create HTTP spans
  context.with(extractedContext, () => {
    next();
  });
});

app.use(express.json());
// Serve static assets, using login.html as the default index for "/"
app.use(
  express.static(path.join(__dirname, 'public'), {
    index: 'login.html',
  })
);

const PORT = process.env.PORT || 3000;
const grpcClients = createClient();

// Initialize OpenFeature
initializeOpenFeature('vegas-frontend-service');

// Initialize Logger
const logger = new Logger('vegas-frontend-service');

// Redis client for balance storage
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

const redisClient = createRedisClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
  password: REDIS_PASSWORD,
});

// Redis connection handling
redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redisClient.on('ready', () => {
  console.log('✅ Redis client ready');
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Redis connection established');
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    console.warn('⚠️  Falling back to in-memory storage');
  }
})();

const DEFAULT_START_BALANCE = 1000;
const BALANCE_KEY_PREFIX = 'vegas:balance:';

// Redis-based user balance functions with OpenTelemetry instrumentation
async function getUserBalance(username) {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  const span = tracer.startSpan('redis.get_balance', undefined, activeContext);
  
  const key = `${BALANCE_KEY_PREFIX}${username || 'Anonymous'}`;
  span.setAttributes({
    'redis.operation': 'GET',
    'redis.key': key,
    'user.username': username || 'Anonymous',
    'db.system': 'redis',
    'db.operation': 'GET'
  });
  
  try {
    if (!redisClient || !redisClient.isOpen) {
      span.setStatus({ code: 2, message: 'Redis client not connected' });
      span.end();
      console.warn('[Redis] Client not connected, returning default balance');
      return DEFAULT_START_BALANCE;
    }
    
    const balance = await redisClient.get(key);
    const parsedBalance = balance ? parseFloat(balance) : DEFAULT_START_BALANCE;
    
    span.setAttributes({
      'redis.value': balance || 'null',
      'user.balance': parsedBalance
    });
    span.setStatus({ code: 1 });
    span.end();
    
    return parsedBalance;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('[Redis] Get error:', error);
    return DEFAULT_START_BALANCE;
  }
}

async function setUserBalance(username, balance) {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  const span = tracer.startSpan('redis.set_balance', undefined, activeContext);
  
  const key = `${BALANCE_KEY_PREFIX}${username || 'Anonymous'}`;
  const finalBalance = Math.max(0, balance);
  
  span.setAttributes({
    'redis.operation': 'SET',
    'redis.key': key,
    'redis.value': finalBalance.toString(),
    'user.username': username || 'Anonymous',
    'user.balance': finalBalance,
    'db.system': 'redis',
    'db.operation': 'SET'
  });
  
  try {
    if (!redisClient || !redisClient.isOpen) {
      span.setStatus({ code: 2, message: 'Redis client not connected' });
      span.end();
      console.warn('[Redis] Client not connected, cannot set balance');
      return finalBalance;
    }
    
    await redisClient.set(key, finalBalance.toString());
    
    span.setStatus({ code: 1 });
    span.end();
    
    console.log(`[Redis] Set balance for ${username}: $${finalBalance}`);
    return finalBalance;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('[Redis] Set error:', error);
    return finalBalance;
  }
}

async function updateUserBalance(username, delta) {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  const span = tracer.startSpan('redis.update_balance', undefined, activeContext);
  
  const key = `${BALANCE_KEY_PREFIX}${username || 'Anonymous'}`;
  const deltaNum = Number(delta || 0);
  
  span.setAttributes({
    'redis.operation': 'UPDATE',
    'redis.key': key,
    'user.username': username || 'Anonymous',
    'transaction.delta': deltaNum,
    'db.system': 'redis',
    'db.operation': 'UPDATE'
  });
  
  try {
    if (!redisClient || !redisClient.isOpen) {
      span.setStatus({ code: 2, message: 'Redis client not connected' });
      span.end();
      console.warn('[Redis] Client not connected, cannot update balance');
      // Fallback: try to get current balance and calculate
      const currentBalance = await getUserBalance(username);
      return Math.max(0, currentBalance + deltaNum);
    }
    
    // Get current balance with tracing
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    const newBalance = Math.max(0, currentBalance + deltaNum);
    
    // Set new balance with tracing
    await redisClient.set(key, newBalance.toString());
    
    span.setAttributes({
      'user.balance_after': newBalance,
      'redis.value': newBalance.toString()
    });
    span.setStatus({ code: 1 });
    span.end();
    
    console.log(`[Redis] Updated balance for ${username}: $${currentBalance} + $${deltaNum} = $${newBalance}`);
    return newBalance;
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('[Redis] Update error:', error);
    // Fallback: try to get current balance and calculate
    const currentBalance = await getUserBalance(username);
    return Math.max(0, currentBalance + deltaNum);
  }
}

async function getUser(username) {
  const balance = await getUserBalance(username);
  return { username: username || 'Anonymous', balance };
}

// Health check
app.get('/health', (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('frontend.health_check');
  span.setAttributes({
    'http.method': 'GET',
    'http.route': '/health',
  });
  try {
    res.json({ status: 'ok', service: 'frontend-service' });
    span.setStatus({ code: 1 }); // OK
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message }); // ERROR
  } finally {
    span.end();
  }
});

// Get all available games
app.get('/api/games', async (req, res) => {
  // Create a child span for business logic (HTTP span is created by auto-instrumentation)
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('lobby.get_games');
  
  try {
    span.setAttributes({
      'lobby.action': 'list_games',
    });
    
    const games = [
      {
        id: 'slots',
        name: 'Slots',
        description: 'Slot machine game',
        icon: '🎰',
        serviceEndpoint: process.env.SLOTS_SERVICE_GRPC || 'localhost:50051'
      },
      {
        id: 'roulette',
        name: 'Roulette',
        description: 'European roulette',
        icon: '🎲',
        serviceEndpoint: process.env.ROULETTE_SERVICE_GRPC || 'localhost:50052'
      },
      {
        id: 'dice',
        name: 'Dice',
        description: 'Craps dice game',
        icon: '🎯',
        serviceEndpoint: process.env.DICE_SERVICE_GRPC || 'localhost:50053'
      },
      {
        id: 'blackjack',
        name: 'Blackjack',
        description: 'Blackjack card game',
        icon: '🃏',
        serviceEndpoint: process.env.BLACKJACK_SERVICE_GRPC || 'localhost:50054'
      }
    ];
    
    span.setAttribute('games.count', games.length);
    span.setStatus({ code: 1 });
    span.end();
    
    res.json({ games });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).json({ error: error.message });
  }
});

// Get game assets for a specific game
// Deprecated: /api/games/:gameId/assets endpoint removed
// Games are now served as static HTML files, no need for dynamic asset fetching

// Helper function to update balance from game result
async function updateBalanceFromGameResult(username, betAmount, result) {
  if (!username) return null;
  
  // Validate betAmount - must be greater than 0 to record game result
  // Validate bet amount
  if (!betAmount || betAmount <= 0 || isNaN(betAmount)) {
    console.warn(`[Balance] Invalid betAmount (${betAmount}) for user ${username}`);
    return null;
  }
  
  try {
    // Deduct bet amount
    await updateUserBalance(username, -betAmount);
    
    // Add winnings if any
    const payout = result.payout || result.winAmount || 0;
    if (payout > 0) {
      await updateUserBalance(username, payout);
    }
    
    // Get updated balance
    const newBalance = await getUserBalance(username);
    
    // Scoring is now handled by backend game services (only on wins)
    // Frontend service no longer calls scoring service directly
    
    return newBalance;
  } catch (error) {
    console.error('Error updating balance from game result:', error);
    return null;
  }
}

// Game action endpoints (proxies to gRPC and updates balance)
app.post('/api/games/:gameId/spin', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Log trace context for debugging
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    console.log(`[Frontend] Spin request - Active span context: traceId=${spanContext.traceId}, spanId=${spanContext.spanId}`);
  } else {
    console.log(`[Frontend] Spin request - No active span, creating root span`);
  }
  
  // Start span in the active context (which should have trace context from middleware)
  const span = tracer.startSpan('game.start', undefined, activeContext);
  
  // Extract gameId at the start to ensure it's always available
  const gameId = req.params?.gameId || 'unknown';
  
  try {
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'spin',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/games/:gameId/spin',
    });
    
    // Check if gRPC client exists for this game
    if (!grpcClients[gameId] || !grpcClients[gameId].spin) {
      const errorMsg = `gRPC client not available for game: ${gameId}`;
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, gameId });
    }
    
    // Convert frontend request format to gRPC format
    // For roulette, handle bet_type and bet_value (for multiple bets)
    // If multiple bets, calculate total bet amount from BetValue
    let totalBetAmount = betAmount;
    if (gameId === 'roulette' && req.body.BetType === 'multiple' && req.body.BetValue) {
      totalBetAmount = 0;
      Object.values(req.body.BetValue).forEach(bet => {
        const betAmt = bet.amount || bet.Amount || bet.betAmount || 0;
        totalBetAmount += parseFloat(betAmt) || 0;
      });
      console.log(`[Roulette] Multiple bets detected. Total bet amount: ${totalBetAmount}`);
    }
    
    // Get current balance and check if user has enough
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    if (currentBalance < totalBetAmount) {
      span.setAttribute('game.error', 'insufficient_balance');
      span.setStatus({ code: 2, message: 'Insufficient balance' });
      span.end();
      return res.status(400).json({ 
        error: 'Insufficient balance', 
        balance: currentBalance,
        required: totalBetAmount 
      });
    }
    
    const grpcRequest = {
      bet_amount: totalBetAmount, // Total bet amount (sum of all bets if multiple)
      bet_type: req.body.BetType || req.body.bet_type || (gameId === 'roulette' ? 'red' : undefined),
      bet_value: req.body.BetValue || req.body.bet_value || {},
      cheat_active: req.body.CheatActive || req.body.cheat_active || false,
      cheat_type: req.body.CheatType || req.body.cheat_type || '',
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.spin with request:`, JSON.stringify(grpcRequest).substring(0, 500));
    const result = await grpcClients[gameId].spin(grpcRequest);
    console.log(`[gRPC] ${gameId}.spin response:`, result ? 'success' : 'failed', result ? `win: ${result.win}, payout: ${result.payout || result.win_amount || 0}` : '');
    
    // Add game identifier and action to result
    result.game = gameId;
    result.action = 'spin';
    
    // Normalize response format (gRPC returns win_amount, but we need payout)
    if (!result.payout && result.win_amount) {
      result.payout = result.win_amount;
    }
    
    span.setAttributes({
      'game.win': result.win || false,
      'game.payout': result.payout || result.winAmount || 0,
    });
    
    // Update balance based on game result
    // Use totalBetAmount for balance calculation (sum of all bets if multiple)
    const newBalance = await updateBalanceFromGameResult(username, totalBetAmount, result);
    span.setAttribute('user.balance_after', newBalance || currentBalance);
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    // Add newBalance to response
    res.json({
      ...result,
      newBalance: newBalance || currentBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error(`[gRPC] Error calling ${gameId}.spin:`, error.message, error.stack);
    res.status(500).json({ error: error.message, gameId });
  }
});

app.post('/api/games/:gameId/roll', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Log trace context for debugging
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    console.log(`[Frontend] Roll request - Active span context: traceId=${spanContext.traceId}, spanId=${spanContext.spanId}`);
  } else {
    console.log(`[Frontend] Roll request - No active span, creating root span`);
  }
  
  // Start span in the active context (which should have trace context from middleware)
  const span = tracer.startSpan('game.start', undefined, activeContext);
  
  // Extract gameId at the start to ensure it's always available
  const gameId = req.params?.gameId || 'unknown';
  
  try {
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'roll',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/games/:gameId/roll',
    });
    
    // Check if gRPC client exists for this game
    if (!grpcClients[gameId] || !grpcClients[gameId].roll) {
      const errorMsg = `gRPC client not available for game: ${gameId}`;
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, gameId });
    }
    
    // Get current balance and check if user has enough
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    if (currentBalance < betAmount) {
      span.setAttribute('game.error', 'insufficient_balance');
      span.setStatus({ code: 2, message: 'Insufficient balance' });
      span.end();
      return res.status(400).json({ 
        error: 'Insufficient balance', 
        balance: currentBalance,
        required: betAmount 
      });
    }
    
    // Convert frontend request format to gRPC format
    const grpcRequest = {
      bet_amount: betAmount,
      bet_type: req.body.BetType || req.body.bet_type || 'pass',
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.roll with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].roll(grpcRequest);
    console.log(`[gRPC] ${gameId}.roll response:`, result ? 'success' : 'failed', result ? `win: ${result.win}, payout: ${result.payout || 0}` : '');
    
    // Add game identifier and action to result
    result.game = gameId;
    result.action = 'roll';
    
    span.setAttributes({
      'game.win': result.win || false,
      'game.payout': result.payout || 0,
    });
    
    // Update balance based on game result
    const newBalance = await updateBalanceFromGameResult(username, betAmount, result);
    span.setAttribute('user.balance_after', newBalance || currentBalance);
    
    span.setStatus({ code: 1 });
    span.end();
    
    // Add newBalance to response
    res.json({
      ...result,
      newBalance: newBalance || currentBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    const gameIdForError = req.params?.gameId || 'unknown';
    console.error(`[gRPC] Error calling ${gameIdForError}.roll:`, error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/games/:gameId/deal', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Log trace context for debugging
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    const spanContext = activeSpan.spanContext();
    console.log(`[Frontend] Deal request - Active span context: traceId=${spanContext.traceId}, spanId=${spanContext.spanId}`);
  } else {
    console.log(`[Frontend] Deal request - No active span, creating root span`);
  }
  
  // Start span in the active context (which should have trace context from middleware)
  const span = tracer.startSpan('game.start', undefined, activeContext);
  
  // Extract gameId at the start to ensure it's always available
  const gameId = req.params?.gameId || 'unknown';
  
  try {
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'deal',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/games/:gameId/deal',
    });
    
    // Check if gRPC client exists for this game
    if (!grpcClients[gameId] || !grpcClients[gameId].deal) {
      const errorMsg = `gRPC client not available for game: ${gameId}`;
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, gameId });
    }
    
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    if (currentBalance < betAmount) {
      span.setAttribute('game.error', 'insufficient_balance');
      span.setStatus({ code: 2, message: 'Insufficient balance' });
      span.end();
      return res.status(400).json({ 
        error: 'Insufficient balance', 
        balance: currentBalance,
        required: betAmount 
      });
    }
    
    // Deduct bet amount for deal
    await updateUserBalance(username, -betAmount);
    
    // Convert frontend request format to gRPC format
    const grpcRequest = {
      bet_amount: betAmount,
      username: username,
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.deal with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].deal(grpcRequest);
    console.log(`[gRPC] ${gameId}.deal response:`, result ? 'success' : 'failed');
    
    span.setAttributes({
      'game.player_score': result.playerScore || result.player_score || 0,
      'game.dealer_score': result.dealerScore || result.dealer_score || 0,
    });
    
    // Add newBalance to response
    const newBalance = await getUserBalance(username);
    span.setAttribute('user.balance_after', newBalance);
    span.setStatus({ code: 1 });
    span.end();
    
    // Return gRPC response format (snake_case) to maintain consistency
    // Frontend will convert as needed
    res.json({
      ...result, // gRPC response already in snake_case
      newBalance: newBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error(`[gRPC] Error calling ${gameId}.deal:`, error.message, error.stack);
    res.status(500).json({ error: error.message, gameId });
  }
});

app.post('/api/games/:gameId/hit', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Start span in the active context (which should have trace context from middleware)
  const span = tracer.startSpan('game.action', undefined, activeContext);
  
  // Extract gameId at the start to ensure it's always available
  const gameId = req.params?.gameId || 'unknown';
  
  try {
    const username = req.body.Username || req.body.username || 'Anonymous';
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'hit',
      'user.username': username,
      'http.method': 'POST',
      'http.route': '/api/games/:gameId/hit',
    });
    
    // Check if gRPC client exists for this game
    if (!grpcClients[gameId] || !grpcClients[gameId].hit) {
      const errorMsg = `gRPC client not available for game: ${gameId}`;
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, gameId });
    }
    
    // Convert frontend request format to gRPC format
    const grpcRequest = {
      username: username,
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.hit with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].hit(grpcRequest);
    console.log(`[gRPC] ${gameId}.hit response:`, result ? 'success' : 'failed');
    
    span.setAttributes({
      'game.player_score': result.playerScore || result.player_score || 0,
      'game.dealer_score': result.dealerScore || result.dealer_score || 0,
    });
    
    span.setStatus({ code: 1 });
    span.end();
    
    // Return gRPC response format (snake_case) - frontend uses gRPC through this service
    res.json(result);
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error(`[gRPC] Error calling ${gameId}.hit:`, error.message, error.stack);
    res.status(500).json({ error: error.message, gameId });
  }
});

app.post('/api/games/:gameId/stand', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Start span in the active context (which should have trace context from middleware)
  const span = tracer.startSpan('game.action', undefined, activeContext);
  
  // Extract gameId at the start to ensure it's always available
  const gameId = req.params?.gameId || 'unknown';
  
  try {
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'stand',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/games/:gameId/stand',
    });
    
    // Check if gRPC client exists for this game
    if (!grpcClients[gameId] || !grpcClients[gameId].stand) {
      const errorMsg = `gRPC client not available for game: ${gameId}`;
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, gameId });
    }
    
    const balanceBefore = await getUserBalance(username);
    span.setAttribute('user.balance_before', balanceBefore);
    
    // Convert frontend request format to gRPC format
    const grpcRequest = {
      username: username,
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.stand with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].stand(grpcRequest);
    console.log(`[gRPC] ${gameId}.stand response:`, result ? 'success' : 'failed', result ? `result: ${result.result}, payout: ${result.payout || 0}` : '');
    
    // Add game identifier and action to result
    result.game = gameId;
    result.action = 'stand';
    
    // Update balance with payout if won
    const payout = result.payout || 0;
    if (payout > 0) {
      await updateUserBalance(username, payout);
    }
    
    span.setAttributes({
      'game.player_score': result.playerScore || result.player_score || 0,
      'game.dealer_score': result.dealerScore || result.dealer_score || 0,
      'game.result': result.result || 'unknown',
      'game.payout': payout,
      'game.win': payout > 0,
    });
    
    // Record game result
    const newBalance = await getUserBalance(username);
    span.setAttribute('user.balance_after', newBalance);
    await updateBalanceFromGameResult(username, betAmount, { ...result, payout, win: payout > 0 });
    
    span.setStatus({ code: 1 });
    span.end();
    
    // Return gRPC response format (snake_case) - frontend uses gRPC through this service
    res.json({
      ...result, // gRPC response already in snake_case
      newBalance: newBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error(`[gRPC] Error calling ${gameId}.stand:`, error.message, error.stack);
    res.status(500).json({ error: error.message, gameId });
  }
});

app.post('/api/games/:gameId/double', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Start span in the active context (which should have trace context from middleware)
  const span = tracer.startSpan('game.action', undefined, activeContext);
  
  // Extract gameId at the start to ensure it's always available
  const gameId = req.params?.gameId || 'unknown';
  
  try {
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'double',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/games/:gameId/double',
    });
    
    // Check if gRPC client exists for this game
    if (!grpcClients[gameId] || !grpcClients[gameId].double) {
      const errorMsg = `gRPC client not available for game: ${gameId}`;
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, gameId });
    }
    
    // Get current balance and check if user has enough for double
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    if (currentBalance < betAmount) {
      span.setAttribute('game.error', 'insufficient_balance');
      span.setStatus({ code: 2, message: 'Insufficient balance to double' });
      span.end();
      return res.status(400).json({ 
        error: 'Insufficient balance to double', 
        balance: currentBalance,
        required: betAmount 
      });
    }
    
    // Deduct additional bet for double
    await updateUserBalance(username, -betAmount);
    
    // Convert frontend request format to gRPC format
    const grpcRequest = {
      username: username,
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.double with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].double(grpcRequest);
    console.log(`[gRPC] ${gameId}.double response:`, result ? 'success' : 'failed');
    
    // Add game identifier and action to result
    result.game = gameId;
    result.action = 'double';
    
    // Update balance with payout if won
    const payout = result.payout || 0;
    if (payout > 0) {
      await updateUserBalance(username, payout);
    }
    
    span.setAttributes({
      'game.player_score': result.playerScore || result.player_score || 0,
      'game.dealer_score': result.dealerScore || result.dealer_score || 0,
      'game.payout': payout,
      'game.win': payout > 0,
    });
    
    // Record game result (double bet = betAmount * 2)
    const newBalance = await getUserBalance(username);
    span.setAttribute('user.balance_after', newBalance);
    await updateBalanceFromGameResult(username, betAmount * 2, { ...result, payout, win: payout > 0 });
    
    span.setStatus({ code: 1 });
    span.end();
    
    // Return gRPC response format (snake_case) - frontend uses gRPC through this service
    res.json({
      ...result, // gRPC response already in snake_case
      newBalance: newBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).json({ error: error.message });
  }
});

// Deprecated: /games/:gameId route removed
// Games are now served as static HTML files (e.g., /slots.html, /roulette.html, etc.)
// No need for dynamic game page rendering

// User management endpoints
app.post('/api/user/login', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Create span and run logic within its context so Redis spans are children
  return context.with(trace.setSpan(activeContext, tracer.startSpan('user.login', undefined, activeContext)), async () => {
    const span = trace.getActiveSpan();
    
    try {
      const username = (req.body && (req.body.Username || req.body.username)) || 'Anonymous';
      const email = req.body.Email || req.body.email || '';
      const profileType = req.body.ProfileType || req.body.profileType || 'other';
      const balance = typeof req.body.Balance === 'number' ? req.body.Balance : (parseFloat(req.body.Balance) || 1000);
      
      // Validation
      if (!username || username.trim().length < 2) {
        if (span) {
          span.setStatus({ code: 2, message: 'Username must be at least 2 characters' });
          span.end();
        }
        return res.status(400).json({ error: 'Username must be at least 2 characters' });
      }
      
      if (!email || !email.includes('@')) {
        if (span) {
          span.setStatus({ code: 2, message: 'Valid email required' });
          span.end();
        }
        return res.status(400).json({ error: 'Valid email address is required' });
      }
      
      if (!['partner', 'customer', 'dynatracer', 'other'].includes(profileType)) {
        if (span) {
          span.setStatus({ code: 2, message: 'Invalid profile type' });
          span.end();
        }
        return res.status(400).json({ error: 'Invalid profile type' });
      }
      
      if (balance < 10) {
        if (span) {
          span.setStatus({ code: 2, message: 'Balance must be at least $10' });
          span.end();
        }
        return res.status(400).json({ error: 'Balance must be at least $10' });
      }
      
      if (span) {
        span.setAttributes({
          'user.username': username,
          'user.email': email,
          'user.profile_type': profileType,
          'user.initial_balance': balance,
          'http.method': 'POST',
          'http.route': '/api/user/login',
        });
      }
      
      // Set user balance (will create redis.set_balance child span)
      await setUserBalance(username, balance);
      
      // Store user info in Redis (optional, for backend services to access)
      const userInfo = {
        username: username,
        email: email,
        profileType: profileType,
        balance: balance,
        createdAt: new Date().toISOString()
      };
      
      // Store user info in Redis with a TTL of 24 hours (if Redis is connected)
      try {
        const userInfoKey = `user:info:${username}`;
        if (redisClient && redisClient.isOpen) {
          await redisClient.setEx(userInfoKey, 24 * 60 * 60, JSON.stringify(userInfo));
          console.log(`[Login] Stored user info in Redis for ${username}`);
        } else {
          console.warn(`[Login] Redis not connected, skipping user info storage for ${username}`);
        }
      } catch (redisError) {
        console.warn(`[Login] Failed to store user info in Redis for ${username}:`, redisError);
        // Continue even if Redis storage fails
      }
      
      // Get final balance (will create redis.get_balance child span)
      const finalBalance = await getUserBalance(username);
      if (span) {
        span.setAttribute('user.balance', finalBalance);
        span.setStatus({ code: 1 });
        span.end();
      }
      
      res.json({ 
        username: username, 
        email: email,
        profileType: profileType,
        balance: finalBalance 
      });
    } catch (error) {
      if (span) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        span.end();
      }
      console.error('Error in /api/user/login:', error);
      res.status(500).json({ error: 'Failed to login user' });
    }
  });
});

app.post('/api/user/init', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Create span and run logic within its context so Redis spans are children
  return context.with(trace.setSpan(activeContext, tracer.startSpan('user.init', undefined, activeContext)), async () => {
    const span = trace.getActiveSpan();
    
    try {
      const username = (req.body && (req.body.Username || req.body.username)) || 'Anonymous';
      const { Balance } = req.body;
      
      if (span) {
        span.setAttributes({
          'user.username': username,
          'user.initial_balance': Balance || 'default',
          'http.method': 'POST',
          'http.route': '/api/user/init',
        });
      }
      
      // If Balance is provided in the request, use it (for initial setup from form)
      if (typeof Balance === 'number' && Balance >= 0) {
        await setUserBalance(username, Balance);
      } else {
        // Ensure balance is stored in Redis even if not provided (will use existing or default)
        // This ensures we have a Redis entry for the user
        const existingBalance = await getUserBalance(username);
        // Only set if it doesn't exist in Redis (i.e., it returned the default)
        // We'll set it to ensure it's persisted
        await setUserBalance(username, existingBalance);
      }
      
      const balance = await getUserBalance(username);
      if (span) {
        span.setAttribute('user.balance', balance);
        span.setStatus({ code: 1 });
        span.end();
      }
      
      res.json({ username: username, balance: balance });
    } catch (error) {
      if (span) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        span.end();
      }
      console.error('Error in /api/user/init:', error);
      res.status(500).json({ error: 'Failed to initialize user' });
    }
  });
});

app.get('/api/user/balance', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  // Create a child span for business logic (HTTP span is created by auto-instrumentation)
  const span = tracer.startSpan('user.get_balance');
  
  try {
    const { username } = req.query;
    const user = username || 'Anonymous';
    
    span.setAttributes({
      'user.username': user,
      'http.method': 'GET',
      'http.route': '/api/user/balance',
    });
    
    const balance = await getUserBalance(user);
    span.setAttribute('user.balance', balance);
    span.setStatus({ code: 1 });
    span.end();
    
    res.json({ username: user, balance: balance });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('Error in /api/user/balance:', error);
    res.status(500).json({ error: 'Failed to get balance' });
  }
});

app.post('/api/user/topup', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const activeContext = context.active();
  
  // Create a child span for business logic (HTTP span is created by auto-instrumentation)
  // Run the entire deposit logic within the span context so Redis spans are children
  return context.with(trace.setSpan(activeContext, tracer.startSpan('user.deposit', undefined, activeContext)), async () => {
    const span = trace.getActiveSpan();
    
    try {
      const { Username, Amount } = req.body;
      const username = Username || 'Anonymous';
      const amount = Math.max(0, Number(Amount || 0));
      
      if (span) {
        span.setAttributes({
          'user.username': username,
          'transaction.type': 'deposit',
          'transaction.amount': amount,
          'http.method': 'POST',
          'http.route': '/api/user/topup',
        });
      }
      
      const balanceBefore = await getUserBalance(username);
      if (span) {
        span.setAttribute('user.balance_before', balanceBefore);
      }
      
      const newBalance = await updateUserBalance(username, amount);
      if (span) {
        span.setAttribute('user.balance_after', newBalance);
      }
      
      // Log deposit
      logger.logDeposit(username, amount, balanceBefore, newBalance, {
        transaction_id: req.body.TransactionId || req.body.CorrelationId || `deposit-${Date.now()}`,
        source: req.body.Source || 'web-ui'
      });
      
      // Scoring is now handled by backend game services (only on wins)
      // Frontend service no longer calls scoring service directly
      
      if (span) {
        span.setStatus({ code: 1 });
        span.end();
      }
      
      res.json({ username: username, balance: newBalance });
    } catch (error) {
      if (span) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        span.end();
      }
      console.error('Error in /api/user/topup:', error);
      res.status(500).json({ error: 'Failed to top up balance' });
    }
  });
});

// Lobby entry tracking endpoint
app.post('/api/user/lobby-entry', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('user.enter_lobby');
  
  try {
    const { Username, TraceId, Page } = req.body;
    
    span.setAttributes({
      'user.username': Username || 'Anonymous',
      'user.action': 'enter_lobby',
      'page.name': Page || 'lobby.html',
      'trace.id': TraceId || 'unknown',
      'http.method': 'POST',
      'http.route': '/api/user/lobby-entry',
    });
    
    span.setStatus({ code: 1 });
    span.end();
    
    res.json({ success: true, page: Page });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).json({ error: error.message });
  }
});

// Navigation tracking endpoint
app.post('/api/user/navigate', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('user.navigate_to_game');
  
  try {
    const { Username, GameType, TraceId } = req.body;
    
    span.setAttributes({
      'user.username': Username || 'Anonymous',
      'game.type': GameType,
      'user.action': 'navigate_to_game',
      'trace.id': TraceId || 'unknown',
      'http.method': 'POST',
      'http.route': '/api/user/navigate',
    });
    
    span.setStatus({ code: 1 });
    span.end();
    
    res.json({ success: true, game: GameType });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).json({ error: error.message });
  }
});

// Direct game endpoints for backward compatibility (dice.html and slots.html use these)
app.post('/api/dice/roll', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  // Create a child span for business logic (HTTP span is created by auto-instrumentation)
  const span = tracer.startSpan('game.start');
  
  try {
    const gameId = 'dice';
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'roll',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/dice/roll',
    });
    
    // Get current balance and check if user has enough
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    if (currentBalance < betAmount) {
      span.setAttribute('game.error', 'insufficient_balance');
      span.setStatus({ code: 2, message: 'Insufficient balance' });
      span.end();
      return res.status(400).json({ 
        error: 'Insufficient balance', 
        balance: currentBalance,
        required: betAmount 
      });
    }
    
    // Convert frontend request format to gRPC format
    const grpcRequest = {
      bet_amount: betAmount,
      bet_type: req.body.BetType || req.body.bet_type || 'pass',
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.roll with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].roll(grpcRequest);
    console.log(`[gRPC] ${gameId}.roll response:`, result ? 'success' : 'failed', result ? `win: ${result.win}, payout: ${result.payout || 0}` : '');
    
    // Add game identifier and action to result
    result.game = gameId;
    result.action = 'roll';
    
    span.setAttributes({
      'game.win': result.win || false,
      'game.payout': result.payout || 0,
    });
    
    // Update balance based on game result (this deducts bet and adds payout)
    const newBalance = await updateBalanceFromGameResult(username, betAmount, result);
    span.setAttribute('user.balance_after', newBalance || currentBalance);
    
    span.setStatus({ code: 1 });
    span.end();
    
    // Add newBalance to response
    res.json({
      ...result,
      newBalance: newBalance || currentBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    const gameIdForError = req.params?.gameId || 'unknown';
    console.error(`[gRPC] Error calling ${gameIdForError}.roll:`, error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Direct slots endpoint for backward compatibility  
app.post('/api/slots/spin', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  // Create a child span for business logic (HTTP span is created by auto-instrumentation)
  const span = tracer.startSpan('game.start');
  
  try {
    const gameId = 'slots';
    const username = req.body.Username || req.body.username || 'Anonymous';
    let betAmount = req.body.BetAmount || req.body.betAmount || 0;
    // Ensure betAmount is valid (minimum 10)
    if (betAmount <= 0) {
      betAmount = 10; // Default minimum bet
    }
    
    span.setAttributes({
      'game.id': gameId,
      'game.action': 'spin',
      'user.username': username,
      'game.bet_amount': betAmount,
      'http.method': 'POST',
      'http.route': '/api/slots/spin',
    });
    
    // Get current balance and check if user has enough
    const currentBalance = await getUserBalance(username);
    span.setAttribute('user.balance_before', currentBalance);
    
    if (currentBalance < betAmount) {
      span.setAttribute('game.error', 'insufficient_balance');
      span.setStatus({ code: 2, message: 'Insufficient balance' });
      span.end();
      return res.status(400).json({ 
        error: 'Insufficient balance', 
        balance: currentBalance,
        required: betAmount 
      });
    }
    
    // Convert frontend request format to gRPC format
    // For roulette, handle bet_type and bet_value (for multiple bets)
    const grpcRequest = {
      bet_amount: betAmount,
      bet_type: req.body.BetType || req.body.bet_type || (gameId === 'roulette' ? 'red' : undefined),
      bet_value: req.body.BetValue || req.body.bet_value || {},
      cheat_active: req.body.CheatActive || req.body.cheat_active || false,
      cheat_type: req.body.CheatType || req.body.cheat_type || '',
      player_info: {
        username: username,
        ...(req.body.CustomerName && { customer_name: req.body.CustomerName }),
        ...(req.body.Email && { email: req.body.Email }),
        ...(req.body.CompanyName && { company_name: req.body.CompanyName }),
      }
    };
    
    console.log(`[gRPC] Calling ${gameId}.spin with request:`, JSON.stringify(grpcRequest).substring(0, 200));
    const result = await grpcClients[gameId].spin(grpcRequest);
    console.log(`[gRPC] ${gameId}.spin response:`, result ? 'success' : 'failed', result ? `win: ${result.win}, payout: ${result.payout || result.win_amount || 0}` : '');
    
    // Add game identifier and action to result
    result.game = gameId;
    result.action = 'spin';
    
    // Normalize response format (gRPC returns win_amount, but we need payout)
    if (!result.payout && result.win_amount) {
      result.payout = result.win_amount;
    }
    
    span.setAttributes({
      'game.win': result.win || false,
      'game.payout': result.payout || result.winAmount || 0,
    });
    
    // Update balance based on game result (this deducts bet and adds payout)
    const newBalance = await updateBalanceFromGameResult(username, betAmount, result);
    span.setAttribute('user.balance_after', newBalance || currentBalance);
    
    span.setStatus({ code: 1 });
    span.end();
    
    // Add newBalance to response
    res.json({
      ...result,
      newBalance: newBalance || currentBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    const gameIdForError = req.params?.gameId || 'unknown';
    console.error(`[gRPC] Error calling ${gameIdForError}.spin:`, error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// Leaderboard endpoints
app.get('/api/leaderboard/:game', async (req, res) => {
  try {
    const { game } = req.params;
    const limit = parseInt(req.query.limit || '10');
    const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
    
    const response = await fetch(`${scoringServiceUrl}/api/scoring/leaderboard/${game}?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const leaderboard = await response.json();
    res.json({ game, leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10');
    const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
    
    const response = await fetch(`${scoringServiceUrl}/api/scoring/leaderboard?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const leaderboard = await response.json();
    res.json({ leaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Helper function to derive topWin from topPlayers array
function deriveTopWinFromTopPlayers(stats) {
  console.log(`[Frontend] 🔍 deriveTopWinFromTopPlayers called with stats:`, {
    hasStats: !!stats,
    statsKeys: stats ? Object.keys(stats) : [],
    topPlayersKey: stats ? (stats.top_players ? 'top_players' : stats.topPlayers ? 'topPlayers' : 'none') : 'no stats',
    topPlayersType: stats ? typeof (stats.top_players || stats.topPlayers) : 'no stats',
    topPlayersIsArray: stats ? Array.isArray(stats.top_players || stats.topPlayers) : false,
    topPlayersLength: stats ? (stats.top_players || stats.topPlayers || []).length : 0
  });
  
  // Handle both snake_case and camelCase formats
  const topPlayers = stats.top_players || stats.topPlayers || [];
  
  if (!stats) {
    console.log(`[Frontend] ❌ deriveTopWinFromTopPlayers: stats is null/undefined`);
    return null;
  }
  
  if (!Array.isArray(topPlayers)) {
    console.log(`[Frontend] ❌ deriveTopWinFromTopPlayers: topPlayers is not an array, type:`, typeof topPlayers, 'value:', topPlayers);
    return null;
  }
  
  if (topPlayers.length === 0) {
    console.log(`[Frontend] ❌ deriveTopWinFromTopPlayers: topPlayers array is empty`);
    return null;
  }
  
  // Get the top player (first in array, should be rank 1)
  const topPlayer = topPlayers[0];
  if (!topPlayer) {
    console.log(`[Frontend] ❌ deriveTopWinFromTopPlayers: topPlayers[0] is null/undefined`);
    return null;
  }
  
  console.log(`[Frontend] 🔍 deriveTopWinFromTopPlayers: topPlayer object:`, JSON.stringify(topPlayer, null, 2));
  console.log(`[Frontend] 🔍 deriveTopWinFromTopPlayers: topPlayer fields:`, {
    username: topPlayer.username,
    winnings: topPlayer.winnings,
    score: topPlayer.score,
    initialBet: topPlayer.initialBet,
    initial_bet: topPlayer.initial_bet,
    bet_amount: topPlayer.bet_amount,
    betAmount: topPlayer.betAmount,
    allKeys: Object.keys(topPlayer)
  });
  
  // Extract winnings (this is the payout amount from player perspective)
  // For casino perspective, we show it as negative
  const winnings = topPlayer.winnings || topPlayer.score || 0;
  const betAmount = topPlayer.initialBet || topPlayer.initial_bet || topPlayer.bet_amount || topPlayer.betAmount || 0;
  
  console.log(`[Frontend] 🔍 deriveTopWinFromTopPlayers: extracted winnings=${winnings} (type: ${typeof winnings}), betAmount=${betAmount} (type: ${typeof betAmount})`);
  
  // Convert to numbers to ensure proper comparison
  const winningsNum = typeof winnings === 'number' ? winnings : parseFloat(winnings) || 0;
  const betAmountNum = typeof betAmount === 'number' ? betAmount : parseFloat(betAmount) || 0;
  
  console.log(`[Frontend] 🔍 deriveTopWinFromTopPlayers: parsed winningsNum=${winningsNum}, betAmountNum=${betAmountNum}`);
  
  if (winningsNum <= 0) {
    console.log(`[Frontend] ❌ deriveTopWinFromTopPlayers: winningsNum is ${winningsNum} (<= 0), returning null`);
    return null; // No win to display
  }
  
  const derivedTopWin = {
    username: topPlayer.username || 'Unknown',
    game: topPlayer.game || stats.game || 'unknown',
    payout: -Math.abs(winningsNum), // Negative for casino perspective (casino loss)
    bet_amount: betAmountNum,
    timestamp: topPlayer.timestamp || new Date().toISOString()
  };
  
  console.log(`[Frontend] ✅ deriveTopWinFromTopPlayers: returning:`, JSON.stringify(derivedTopWin));
  return derivedTopWin;
}

// Dashboard endpoints - use gRPC to call dashboard service
// Architecture: Browser → HTTP → Frontend Service → gRPC → Dashboard Service → Scoring Service
app.get('/api/dashboard/:game', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('dashboard.get_stats');
  
  try {
    const { game } = req.params;
    
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/dashboard/:game',
      'dashboard.game': game,
    });
    
    // Check if gRPC client exists for dashboard
    if (!grpcClients.dashboard || !grpcClients.dashboard.getDashboardStats) {
      const errorMsg = 'gRPC client not available for dashboard service';
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg });
    }
    
    console.log(`[gRPC] Calling dashboard.getDashboardStats for game: ${game}`);
    const result = await grpcClients.dashboard.getDashboardStats({ game });
    console.log(`[gRPC] dashboard.getDashboardStats response:`, result ? 'success' : 'failed');
    if (result && result.stats) {
      console.log(`[gRPC] Dashboard stats for ${game}:`, JSON.stringify(result.stats).substring(0, 200));
      console.log(`[gRPC] Dashboard stats structure:`, {
        hasTopWin: !!(result.stats.top_win || result.stats.topWin),
        hasTopPlayers: !!(result.stats.top_players || result.stats.topPlayers),
        topPlayersCount: (result.stats.top_players || result.stats.topPlayers || []).length,
        topPlayersFirst: (result.stats.top_players || result.stats.topPlayers || [])[0]
      });
    }
    
    // Convert snake_case to camelCase for frontend
    const stats = result.stats || {};
    
    // Always attempt to derive topWin from topPlayers if it's missing
    // This ensures we always have topWin data when topPlayers is available
    let topWin = stats.top_win || stats.topWin || null;
    
    console.log(`[Frontend] Processing dashboard stats for ${game}:`, {
      hasTopWin: !!topWin,
      topWinValue: topWin ? JSON.stringify(topWin) : 'null',
      hasTopPlayers: !!(stats.top_players || stats.topPlayers),
      topPlayersCount: (stats.top_players || stats.topPlayers || []).length,
      topPlayersFirst: (stats.top_players || stats.topPlayers || [])[0]
    });
    
    // If topWin is null/undefined, always try to derive it from topPlayers
    if (!topWin) {
      console.log(`[Frontend] ⚠️ topWin is null/undefined for ${game}, attempting to derive from topPlayers...`);
      console.log(`[Frontend] stats object keys:`, Object.keys(stats));
      console.log(`[Frontend] stats.top_players type:`, typeof stats.top_players, 'isArray:', Array.isArray(stats.top_players));
      console.log(`[Frontend] stats.topPlayers type:`, typeof stats.topPlayers, 'isArray:', Array.isArray(stats.topPlayers));
      
      topWin = deriveTopWinFromTopPlayers(stats);
      
      if (topWin) {
        console.log(`[Frontend] ✅ Successfully derived topWin from topPlayers for ${game}:`, JSON.stringify(topWin));
      } else {
        console.log(`[Frontend] ❌ Failed to derive topWin from topPlayers for ${game}`);
        console.log(`[Frontend] Debug info:`, {
          statsExists: !!stats,
          topPlayersExists: !!(stats.top_players || stats.topPlayers),
          topPlayersLength: (stats.top_players || stats.topPlayers || []).length,
          firstPlayer: (stats.top_players || stats.topPlayers || [])[0]
        });
      }
    } else {
      console.log(`[Frontend] ✅ Using existing topWin for ${game}:`, JSON.stringify(topWin));
    }
    
    // Create topWin object if we have one
    const topWinObj = topWin ? {
      username: topWin.username || 'Unknown',
      game: topWin.game || game,
      payout: topWin.payout || 0,
      bet_amount: topWin.bet_amount || topWin.betAmount || 0,
      timestamp: topWin.timestamp || new Date().toISOString()
    } : null;
    
    console.log(`[Frontend] Final topWin object for ${game}:`, topWinObj ? JSON.stringify(topWinObj) : 'null');
    
    const normalizedStats = {
      game: stats.game || game,
      totalGames: stats.total_games || stats.totalGames || 0,
      totalWins: stats.total_wins || stats.totalWins || 0,
      totalLosses: stats.total_losses || stats.totalLosses || 0,
      totalBetAmount: stats.total_bet_amount || stats.totalBetAmount || 0,
      totalPayout: stats.total_payout || stats.totalPayout || 0,
      // Include both snake_case and camelCase for compatibility
      top_win: topWinObj,
      topWin: topWinObj,
      topPlayers: (stats.top_players || stats.topPlayers || []).map(p => ({
        username: p.username,
        role: p.role || 'player',
        game: p.game || game,
        score: p.score || 0,
        winnings: p.winnings || p.score || 0,
        initialBet: p.initialBet || p.initial_bet || p.bet_amount || p.betAmount || 0,
        metadata: p.metadata ? (typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata) : {}
      })),
      recentGames: stats.recent_games || stats.recentGames || []
    };
    
    console.log(`[Frontend] Normalized stats for ${game} - top_win:`, normalizedStats.top_win ? JSON.stringify(normalizedStats.top_win) : 'null', ', topWin:', normalizedStats.topWin ? JSON.stringify(normalizedStats.topWin) : 'null');
    console.log(`[Frontend] 📤 Sending response for ${game} with top_win:`, normalizedStats.top_win ? 'EXISTS' : 'NULL', ', topWin:', normalizedStats.topWin ? 'EXISTS' : 'NULL');
    console.log(`[Frontend] 📤 Full normalizedStats keys:`, Object.keys(normalizedStats));
    console.log(`[Frontend] 📤 Direct check - normalizedStats.top_win:`, normalizedStats.top_win);
    console.log(`[Frontend] 📤 Direct check - normalizedStats.topWin:`, normalizedStats.topWin);
    console.log(`[Frontend] 📤 Has own property top_win:`, normalizedStats.hasOwnProperty('top_win'));
    console.log(`[Frontend] 📤 Has own property topWin:`, normalizedStats.hasOwnProperty('topWin'));
    
    // CRITICAL: Verify topWin is actually in the object before sending
    if (topWinObj && (!normalizedStats.top_win || !normalizedStats.topWin)) {
      console.error(`[Frontend] ⚠️ ERROR: topWinObj exists but not in normalizedStats! Force-setting...`);
      normalizedStats.top_win = topWinObj;
      normalizedStats.topWin = topWinObj;
      console.log(`[Frontend] ✅ Force-set topWin in normalizedStats`);
    }
    
    span.setStatus({ code: 1 });
    span.end();
    
    const response = { game, stats: normalizedStats };
    console.log(`[Frontend] 📤 Final response structure for ${game}:`, {
      hasStats: !!response.stats,
      statsKeys: response.stats ? Object.keys(response.stats) : [],
      hasTopWin: !!(response.stats && (response.stats.top_win || response.stats.topWin)),
      topWinValue: response.stats ? (response.stats.top_win || response.stats.topWin) : null,
      topWinStringified: response.stats && (response.stats.top_win || response.stats.topWin) ? JSON.stringify(response.stats.top_win || response.stats.topWin) : 'null'
    });
    
    // Final verification before sending
    const responseString = JSON.stringify(response);
    const responseParsed = JSON.parse(responseString);
    console.log(`[Frontend] 📤 Response after JSON serialization - topWin check:`, 
      responseParsed.stats ? (responseParsed.stats.top_win || responseParsed.stats.topWin) : null);
    
    // CRITICAL: Verify topWin exists in parsed response and fix if missing
    if (responseParsed.stats && (!responseParsed.stats.top_win && !responseParsed.stats.topWin)) {
      console.error(`[Frontend] ❌ CRITICAL ERROR: Single game ${game} has NO topWin in final parsed response!`);
      console.error(`[Frontend] ❌ Stats keys:`, Object.keys(responseParsed.stats));
      console.error(`[Frontend] ❌ Full stats object:`, JSON.stringify(responseParsed.stats).substring(0, 500));
      // Try to re-derive and force-set it
      const rederived = deriveTopWinFromTopPlayers(responseParsed.stats);
      if (rederived) {
        console.log(`[Frontend] 🔧 Re-deriving and force-setting topWin for single game ${game}`);
        responseParsed.stats.top_win = {
          username: rederived.username || 'Unknown',
          game: rederived.game || game,
          payout: rederived.payout || 0,
          bet_amount: rederived.bet_amount || rederived.betAmount || 0,
          timestamp: rederived.timestamp || new Date().toISOString()
        };
        responseParsed.stats.topWin = responseParsed.stats.top_win;
        console.log(`[Frontend] ✅ Force-set topWin for single game ${game}:`, JSON.stringify(responseParsed.stats.top_win));
        // Re-serialize to ensure the fix is included
        const fixedResponseString = JSON.stringify(responseParsed);
        const fixedResponseParsed = JSON.parse(fixedResponseString);
        res.json(fixedResponseParsed);
        return;
      }
    } else if (responseParsed.stats) {
      console.log(`[Frontend] ✅ Single game ${game} HAS topWin in parsed response:`, JSON.stringify(responseParsed.stats.top_win || responseParsed.stats.topWin));
    }
    
    // Use the parsed response to ensure JSON serialization didn't lose data
    res.json(responseParsed);
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error(`[gRPC] Error calling dashboard.getDashboardStats:`, error.message, error.stack);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('dashboard.get_all_stats');
  
  try {
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/dashboard',
    });
    
    // Check if gRPC client exists for dashboard
    if (!grpcClients.dashboard || !grpcClients.dashboard.getAllDashboardStats) {
      const errorMsg = 'gRPC client not available for dashboard service';
      span.setStatus({ code: 2, message: errorMsg });
      span.end();
      console.error(`[gRPC] ${errorMsg}`);
      return res.status(503).json({ error: errorMsg, stats: [] });
    }
    
    console.log(`[gRPC] Calling dashboard.getAllDashboardStats`);
    const result = await grpcClients.dashboard.getAllDashboardStats({});
    console.log(`[gRPC] dashboard.getAllDashboardStats response:`, result ? 'success' : 'failed');
    if (result && result.stats) {
      console.log(`[gRPC] Dashboard stats array length:`, result.stats.length);
      if (result.stats.length > 0) {
        console.log(`[gRPC] First stats entry structure:`, {
          game: result.stats[0].game,
          hasTopWin: !!(result.stats[0].top_win || result.stats[0].topWin),
          hasTopPlayers: !!(result.stats[0].top_players || result.stats[0].topPlayers),
          topPlayersCount: (result.stats[0].top_players || result.stats[0].topPlayers || []).length
        });
      }
    }
    
    // Convert snake_case to camelCase for frontend
    const statsArray = (result.stats || []).map(s => {
      // Try to get topWin from stats, or derive it from topPlayers
      let topWin = s.top_win || s.topWin || null;
      if (!topWin) {
        console.log(`[Frontend] topWin is null for ${s.game || 'unknown'}, attempting to derive from topPlayers...`);
        topWin = deriveTopWinFromTopPlayers(s);
        if (topWin) {
          console.log(`[Frontend] ✅ Derived topWin from topPlayers for ${s.game || 'unknown'}:`, JSON.stringify(topWin));
        } else {
          console.log(`[Frontend] ❌ Failed to derive topWin from topPlayers for ${s.game || 'unknown'}`);
        }
      } else {
        console.log(`[Frontend] Using existing topWin for ${s.game || 'unknown'}:`, JSON.stringify(topWin));
      }
      
      // Create topWin object if we have one
      const topWinObj = topWin ? {
        username: topWin.username || 'Unknown',
        game: topWin.game || s.game,
        payout: topWin.payout || 0,
        bet_amount: topWin.bet_amount || topWin.betAmount || 0,
        timestamp: topWin.timestamp || new Date().toISOString()
      } : null;
      
      console.log(`[Frontend] Final topWin object for ${s.game || 'unknown'}:`, topWinObj ? JSON.stringify(topWinObj) : 'null');
      console.log(`[Frontend] topWinObj type:`, typeof topWinObj, 'isNull:', topWinObj === null, 'isUndefined:', topWinObj === undefined);
      
      const normalizedGameStats = {
        game: s.game || 'unknown',
        totalGames: s.total_games || s.totalGames || 0,
        totalWins: s.total_wins || s.totalWins || 0,
        totalLosses: s.total_losses || s.totalLosses || 0,
        totalBetAmount: s.total_bet_amount || s.totalBetAmount || 0,
        totalPayout: s.total_payout || s.totalPayout || 0,
        // Include both snake_case and camelCase for compatibility - CRITICAL: must be included even if null
        top_win: topWinObj,
        topWin: topWinObj,
        topPlayers: (s.top_players || s.topPlayers || []).map(p => ({
          username: p.username,
          role: p.role || 'player',
          game: p.game || s.game,
          score: p.score || 0,
          winnings: p.winnings || p.score || 0,
          initialBet: p.initialBet || p.initial_bet || p.bet_amount || p.betAmount || 0,
          metadata: p.metadata ? (typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata) : {}
        })),
        recentGames: s.recent_games || s.recentGames || []
      };
      
      // CRITICAL: Verify topWin is actually in the object
      console.log(`[Frontend] 📤 Normalized game stats for ${s.game || 'unknown'}:`, {
        hasTopWin: !!(normalizedGameStats.top_win || normalizedGameStats.topWin),
        topWinValue: normalizedGameStats.top_win || normalizedGameStats.topWin,
        topWinType: typeof (normalizedGameStats.top_win || normalizedGameStats.topWin),
        topWinStringified: normalizedGameStats.top_win ? JSON.stringify(normalizedGameStats.top_win) : 'null',
        allKeys: Object.keys(normalizedGameStats),
        directTopWinCheck: normalizedGameStats.hasOwnProperty('top_win'),
        directTopWinValue: normalizedGameStats.top_win
      });
      
      // Double-check: ensure topWin is actually set
      if (topWinObj && (!normalizedGameStats.top_win || !normalizedGameStats.topWin)) {
        console.error(`[Frontend] ⚠️ ERROR: topWinObj exists but not in normalizedGameStats!`);
        console.error(`[Frontend] topWinObj:`, JSON.stringify(topWinObj));
        console.error(`[Frontend] normalizedGameStats.top_win:`, normalizedGameStats.top_win);
        console.error(`[Frontend] normalizedGameStats.topWin:`, normalizedGameStats.topWin);
        // Force set it
        normalizedGameStats.top_win = topWinObj;
        normalizedGameStats.topWin = topWinObj;
        console.log(`[Frontend] ✅ Force-set topWin in normalizedGameStats`);
      }
      
      return normalizedGameStats;
    });
    
    console.log(`[Frontend] 📤 Final statsArray before sending:`, statsArray.map(s => ({
      game: s.game,
      hasTopWin: !!(s.top_win || s.topWin),
      topWinValue: s.top_win || s.topWin,
      topWinType: typeof (s.top_win || s.topWin),
      topWinStringified: s.top_win ? JSON.stringify(s.top_win) : 'null'
    })));
    
    // Verify each stat has topWin before sending
    statsArray.forEach((s, index) => {
      if (!s.top_win && !s.topWin) {
        console.error(`[Frontend] ⚠️ WARNING: Game ${s.game} at index ${index} has NO topWin in final array!`);
        console.error(`[Frontend] ⚠️ Stats keys:`, Object.keys(s));
        console.error(`[Frontend] ⚠️ Stats object:`, JSON.stringify(s).substring(0, 500));
      } else {
        console.log(`[Frontend] ✅ Game ${s.game} at index ${index} HAS topWin:`, JSON.stringify(s.top_win || s.topWin));
      }
    });
    
    span.setStatus({ code: 1 });
    span.end();
    
    const response = { stats: statsArray };
    console.log(`[Frontend] 📤 Sending /api/dashboard response with ${statsArray.length} games`);
    console.log(`[Frontend] 📤 Response structure:`, {
      hasStats: !!response.stats,
      statsLength: response.stats ? response.stats.length : 0,
      firstGameTopWin: response.stats && response.stats[0] ? (response.stats[0].top_win || response.stats[0].topWin) : null
    });
    
    // Double-check response before sending
    // Final verification: serialize and parse to check what will actually be sent
    const responseString = JSON.stringify(response);
    const responseParsed = JSON.parse(responseString);
    console.log(`[Frontend] 📤 Response after JSON serialization check - first game topWin:`, 
      responseParsed.stats && responseParsed.stats[0] ? (responseParsed.stats[0].top_win || responseParsed.stats[0].topWin) : null);
    
    // CRITICAL: Verify each game has topWin in the parsed response and fix if missing
    let responseNeedsFix = false;
    responseParsed.stats.forEach((s, idx) => {
      if (!s.top_win && !s.topWin) {
        console.error(`[Frontend] ❌ CRITICAL ERROR: Game ${s.game} at index ${idx} has NO topWin in final parsed response!`);
        console.error(`[Frontend] ❌ Stats keys:`, Object.keys(s));
        console.error(`[Frontend] ❌ Full stats object (first 500 chars):`, JSON.stringify(s).substring(0, 500));
        // Try to re-derive and force-set it
        const rederived = deriveTopWinFromTopPlayers(s);
        if (rederived) {
          console.log(`[Frontend] 🔧 Re-deriving and force-setting topWin for ${s.game}`);
          s.top_win = {
            username: rederived.username || 'Unknown',
            game: rederived.game || s.game,
            payout: rederived.payout || 0,
            bet_amount: rederived.bet_amount || rederived.betAmount || 0,
            timestamp: rederived.timestamp || new Date().toISOString()
          };
          s.topWin = s.top_win;
          responseNeedsFix = true;
          console.log(`[Frontend] ✅ Force-set topWin for ${s.game}:`, JSON.stringify(s.top_win));
        } else {
          console.error(`[Frontend] ❌ Could not re-derive topWin for ${s.game} - topPlayers may be empty`);
        }
      } else {
        console.log(`[Frontend] ✅ Game ${s.game} at index ${idx} HAS topWin in parsed response:`, JSON.stringify(s.top_win || s.topWin));
      }
    });
    
    if (responseNeedsFix) {
      console.log(`[Frontend] 🔧 Response was patched - re-serializing...`);
      // Re-serialize to ensure the fix is included
      const fixedResponseString = JSON.stringify(responseParsed);
      const fixedResponseParsed = JSON.parse(fixedResponseString);
      console.log(`[Frontend] ✅ Fixed response verified - first game topWin:`, 
        fixedResponseParsed.stats && fixedResponseParsed.stats[0] ? (fixedResponseParsed.stats[0].top_win || fixedResponseParsed.stats[0].topWin) : null);
      res.json(fixedResponseParsed);
    } else {
      // Send the verified response
      res.json(responseParsed);
    }
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error(`[gRPC] Error calling dashboard.getAllDashboardStats:`, error.message, error.stack);
    res.status(500).json({ error: error.message, stats: [] });
  }
});

app.get('/api/game-results/:game', async (req, res) => {
  try {
    const { game } = req.params;
    const limit = parseInt(req.query.limit || '50');
    const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
    
    const response = await fetch(`${scoringServiceUrl}/api/scoring/game-results/${game}?limit=${limit}`);
    if (!response.ok) {
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const results = await response.json();
    res.json({ game, results });
  } catch (error) {
    console.error('Error fetching game results:', error);
    res.status(500).json({ error: 'Failed to fetch game results' });
  }
});

// Main lobby page
app.get('/', (req, res) => {
  const lobbyPath = path.join(__dirname, 'public', 'lobby.html');
  console.log('[Frontend] Incoming GET / request, attempting to serve lobby from:', lobbyPath);

  fs.access(lobbyPath, fs.constants.R_OK, (accessErr) => {
    if (accessErr) {
      console.error('[Frontend] lobby.html not readable or missing:', accessErr.message);
      return res.status(500).send('Lobby page is not available (missing lobby.html)');
    }

    res.sendFile(lobbyPath, (sendErr) => {
      if (sendErr) {
        console.error('[Frontend] Error sending lobby.html:', sendErr.message);
        if (!res.headersSent) {
          res.status(500).send('Failed to render lobby page');
        }
      } else {
        console.log('[Frontend] Successfully served lobby.html');
      }
    });
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing Redis connection...');
  try {
    await redisClient.quit();
    console.log('Redis connection closed');
  } catch (error) {
    console.error('Error closing Redis connection:', error);
  }
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🎮 Frontend service running on port ${PORT}`);
  console.log(`📡 gRPC clients initialized`);
  console.log(`💾 Redis: ${REDIS_HOST}:${REDIS_PORT}`);
});

