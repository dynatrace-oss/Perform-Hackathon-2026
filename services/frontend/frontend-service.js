/**
 * Frontend Service - gRPC-based game rendering service
 * Aggregates game assets from all microservices and provides unified frontend
 */

const express = require('express');
const path = require('path');
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
const { context, propagation } = require('@opentelemetry/api');
app.use((req, res, next) => {
  // Extract trace context from incoming request headers
  const extractedContext = propagation.extract(context.active(), req.headers);
  context.with(extractedContext, () => {
    next();
  });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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

// Redis-based user balance functions
async function getUserBalance(username) {
  const key = `${BALANCE_KEY_PREFIX}${username || 'Anonymous'}`;
  try {
    const balance = await redisClient.get(key);
    return balance ? parseFloat(balance) : DEFAULT_START_BALANCE;
  } catch (error) {
    console.error('Redis get error:', error);
    return DEFAULT_START_BALANCE;
  }
}

async function setUserBalance(username, balance) {
  const key = `${BALANCE_KEY_PREFIX}${username || 'Anonymous'}`;
  try {
    await redisClient.set(key, Math.max(0, balance).toString());
    return Math.max(0, balance);
  } catch (error) {
    console.error('Redis set error:', error);
    return balance;
  }
}

async function updateUserBalance(username, delta) {
  const key = `${BALANCE_KEY_PREFIX}${username || 'Anonymous'}`;
  try {
    const currentBalance = await getUserBalance(username);
    const newBalance = Math.max(0, currentBalance + Number(delta || 0));
    await redisClient.set(key, newBalance.toString());
    return newBalance;
  } catch (error) {
    console.error('Redis update error:', error);
    // Fallback: try to get current balance and calculate
    const currentBalance = await getUserBalance(username);
    return Math.max(0, currentBalance + Number(delta || 0));
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
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('lobby.get_games');
  
  try {
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/games',
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
app.get('/api/games/:gameId/assets', async (req, res) => {
  try {
    const { gameId } = req.params;
    const { assetType = 'all' } = req.query;

    let assets;
    switch (gameId) {
      case 'slots':
        assets = await grpcClients.slots.getGameAssets({ assetType });
        break;
      case 'roulette':
        // Roulette service uses HTTP endpoint, not gRPC
        try {
          const rouletteResponse = await fetch(`${process.env.ROULETTE_SERVICE_URL || 'http://localhost:8082'}/api/game-assets`);
          if (rouletteResponse.ok) {
            const rouletteData = await rouletteResponse.json();
            assets = {
              html: rouletteData.html || '',
              javascript: rouletteData.javascript || '',
              css: rouletteData.css || '',
              config: rouletteData.config || {}
            };
          } else {
            throw new Error(`Roulette service returned ${rouletteResponse.status}`);
          }
        } catch (error) {
          // Fallback: try gRPC if HTTP fails
          if (grpcClients.roulette && grpcClients.roulette.getGameAssets) {
            assets = await grpcClients.roulette.getGameAssets({ assetType });
          } else {
            throw error;
          }
        }
        break;
      case 'dice':
        assets = await grpcClients.dice.getGameAssets({ assetType });
        break;
      case 'blackjack':
        assets = await grpcClients.blackjack.getGameAssets({ assetType });
        break;
      default:
        return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
      gameId,
      html: assets.html,
      javascript: assets.javascript,
      css: assets.css,
      config: assets.config
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to update balance from game result
async function updateBalanceFromGameResult(username, betAmount, result) {
  if (!username) return null;
  
  // Validate betAmount - must be greater than 0 to record game result
  // This prevents invalid records from being saved to the database
  if (!betAmount || betAmount <= 0 || isNaN(betAmount)) {
    console.warn(`[Scoring] Skipping game result recording: invalid betAmount (${betAmount}) for user ${username}`);
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
    
    // Record game result in PostgreSQL via scoring service
    try {
      const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
      const game = result.game || 'unknown';
      const action = result.action || 'play';
      const win = payout > 0;
      const resultType = result.result || (win ? 'win' : 'lose');
      
      // Prepare game-specific data
      const gameData = {};
      if (result.result) gameData.result = result.result; // slots symbols, dice values, etc.
      if (result.winning_number) gameData.winningNumber = result.winning_number; // roulette
      if (result.dice1) gameData.dice1 = result.dice1; // dice
      if (result.dice2) gameData.dice2 = result.dice2; // dice
      if (result.playerHand) gameData.playerHand = result.playerHand; // blackjack
      if (result.dealerHand) gameData.dealerHand = result.dealerHand; // blackjack
      
      // Record game result - betAmount is already validated above
      await fetch(`${scoringServiceUrl}/api/scoring/game-result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          game: game,
          action: action,
          betAmount: betAmount,
          payout: payout,
          win: win,
          result: resultType,
          gameData: JSON.stringify(gameData),
          metadata: JSON.stringify({
            balance: newBalance,
            timestamp: new Date().toISOString(),
            cheatActive: result.cheat_active || false,
            cheatType: result.cheat_type || null
          })
        })
      }).catch(err => {
        console.warn('Failed to record game result in scoring service:', err.message);
      });
      
      // Also record score (balance) for leaderboard
      await fetch(`${scoringServiceUrl}/api/scoring/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          role: 'player',
          game: game,
          score: newBalance,
          metadata: JSON.stringify({
            betAmount: betAmount,
            payout: payout,
            win: win,
            timestamp: new Date().toISOString()
          })
        })
      }).catch(err => {
        console.warn('Failed to record score in scoring service:', err.message);
      });
    } catch (scoringError) {
      console.warn('Error recording game result:', scoringError.message);
    }
    
    return newBalance;
  } catch (error) {
    console.error('Error updating balance from game result:', error);
    return null;
  }
}

// Game action endpoints (proxies to gRPC and updates balance)
app.post('/api/games/:gameId/spin', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('game.start');
  
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
    
    // Add game identifier and action to result for scoring
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
    const newBalance = await updateBalanceFromGameResult(username, betAmount, result);
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
  const span = tracer.startSpan('game.start');
  
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
    
    // Add game identifier and action to result for scoring
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
  const span = tracer.startSpan('game.start');
  
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
    
    res.json({
      ...result,
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
  const span = tracer.startSpan('game.action');
  
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
  const span = tracer.startSpan('game.action');
  
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
    
    // Add game identifier and action to result for scoring
    result.game = gameId;
    result.action = 'stand';
    
    // Update balance with payout if won
    const payout = result.payout || 0;
    if (payout > 0) {
      await updateUserBalance(username, payout);
    }
    
    span.setAttributes({
      'game.player_score': result.playerScore || result.dealer_score || 0,
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
    
    // Add newBalance to response
    res.json({
      ...result,
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
  const span = tracer.startSpan('game.action');
  
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
    
    // Add game identifier and action to result for scoring
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
    
    // Add newBalance to response
    res.json({
      ...result,
      newBalance: newBalance
    });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).json({ error: error.message });
  }
});

// Render game page
app.get('/games/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const assets = await grpcClients[gameId].getGameAssets({ assetType: 'all' });

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${assets.config.game_name || gameId}</title>
    <style>${assets.css}</style>
</head>
<body>
    ${assets.html}
    <script>
        // Inject game configuration
        window.GAME_CONFIG = ${JSON.stringify(assets.config)};
        window.GRPC_ENDPOINT = '${assets.config.service_endpoint}';
    </script>
    <script>${assets.javascript}</script>
</body>
</html>`;

    res.send(html);
  } catch (error) {
    res.status(500).send(`<h1>Error loading game</h1><p>${error.message}</p>`);
  }
});

// User management endpoints
app.post('/api/user/init', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
  const span = tracer.startSpan('user.init');
  
  try {
    const username = (req.body && (req.body.Username || req.body.username)) || 'Anonymous';
    const { Balance } = req.body;
    
    span.setAttributes({
      'user.username': username,
      'user.initial_balance': Balance || 'default',
      'http.method': 'POST',
      'http.route': '/api/user/init',
    });
    
    // If Balance is provided in the request, use it (for initial setup from form)
    if (typeof Balance === 'number' && Balance >= 0) {
      await setUserBalance(username, Balance);
    }
    
    const balance = await getUserBalance(username);
    span.setAttribute('user.balance', balance);
    span.setStatus({ code: 1 });
    span.end();
    
    res.json({ username: username, balance: balance });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('Error in /api/user/init:', error);
    res.status(500).json({ error: 'Failed to initialize user' });
  }
});

app.get('/api/user/balance', async (req, res) => {
  const tracer = trace.getTracer('vegas-frontend-service');
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
  const span = tracer.startSpan('user.deposit');
  
  try {
    const { Username, Amount } = req.body;
    const username = Username || 'Anonymous';
    const amount = Math.max(0, Number(Amount || 0));
    
    span.setAttributes({
      'user.username': username,
      'transaction.type': 'deposit',
      'transaction.amount': amount,
      'http.method': 'POST',
      'http.route': '/api/user/topup',
    });
    
    const balanceBefore = await getUserBalance(username);
    span.setAttribute('user.balance_before', balanceBefore);
    
    const newBalance = await updateUserBalance(username, amount);
    span.setAttribute('user.balance_after', newBalance);
    
    // Log deposit
    logger.logDeposit(username, amount, balanceBefore, newBalance, {
      transaction_id: req.body.TransactionId || req.body.CorrelationId || `deposit-${Date.now()}`,
      source: req.body.Source || 'web-ui'
    });
    
    // Record score in PostgreSQL via scoring service
    try {
      const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
      const role = req.body.Role || req.body.role || 'player';
      const game = req.body.Game || req.body.game || 'deposit';
      
      await fetch(`${scoringServiceUrl}/api/scoring/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username,
          role: role,
          game: game,
          score: newBalance, // Use balance as score
          metadata: JSON.stringify({
            depositAmount: amount,
            timestamp: new Date().toISOString()
          })
        })
      }).catch(err => {
        console.warn('Failed to record score in scoring service:', err.message);
        // Don't fail the request if scoring service is unavailable
      });
    } catch (scoringError) {
      console.warn('Error recording score:', scoringError.message);
      // Continue even if scoring fails
    }
    
    span.setStatus({ code: 1 });
    span.end();
    
    res.json({ username: username, balance: newBalance });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    console.error('Error in /api/user/topup:', error);
    res.status(500).json({ error: 'Failed to top up balance' });
  }
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
    
    // Add game identifier and action to result for scoring
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
    const grpcRequest = {
      bet_amount: betAmount,
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
    
    // Add game identifier and action to result for scoring
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

// Dashboard endpoints
app.get('/api/dashboard/:game', async (req, res) => {
  try {
    const { game } = req.params;
    const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
    
    const response = await fetch(`${scoringServiceUrl}/api/scoring/dashboard/${game}`);
    if (!response.ok) {
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const stats = await response.json();
    res.json({ game, stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const scoringServiceUrl = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';
    
    const response = await fetch(`${scoringServiceUrl}/api/scoring/dashboard`);
    if (!response.ok) {
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const stats = await response.json();
    res.json({ stats });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
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
  res.sendFile(path.join(__dirname, 'public/lobby.html'));
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

