/**
 * Blackjack Service with gRPC Support
 * Provides both HTTP and gRPC endpoints
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { createService } = require('./common/service-runner');
const { trace, context, propagation } = require('@opentelemetry/api');
const { getFeatureFlag } = require('./common/openfeature');
const { initializeRedis, set, get, del } = require('./common/redis');
const { recordGameResult, recordScore } = require('./common/scoring');
const Logger = require('./common/logger');

// Helper function to extract metadata for trace context
function extractMetadata(metadata) {
  const carrier = {};
  try {
    if (metadata && metadata.getMap) {
      const metadataMap = metadata.getMap();
      // Check if it's a Map object
      if (metadataMap instanceof Map) {
        for (const [key, value] of metadataMap.entries()) {
          carrier[key.toLowerCase()] = Array.isArray(value) ? value[0] : String(value);
        }
      } else if (typeof metadataMap === 'object') {
        // If it's a plain object, iterate over keys
        for (const key in metadataMap) {
          if (metadataMap.hasOwnProperty(key)) {
            const value = metadataMap[key];
            carrier[key.toLowerCase()] = Array.isArray(value) ? value[0] : String(value);
          }
        }
      }
    }
  } catch (error) {
    console.warn('Failed to extract metadata for trace context:', error.message);
  }
  return carrier;
}

// Initialize Redis
initializeRedis();

// Initialize Logger
const logger = new Logger('vegas-blackjack-service');

// Load proto file
const PROTO_PATH = path.join(__dirname, './proto/blackjack.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const blackjackProto = grpc.loadPackageDefinition(packageDefinition).blackjack;

// Redis key prefix for game state
const GAME_STATE_KEY_PREFIX = 'blackjack:game:';
const GAME_STATE_TTL = 3600; // 1 hour

// Helper functions for Redis game state management
async function getGameState(username) {
  const key = `${GAME_STATE_KEY_PREFIX}${username}`;
  const stateJson = await get(key);
  if (!stateJson) {
    return null;
  }
  try {
    return JSON.parse(stateJson);
  } catch (error) {
    console.error('Error parsing game state from Redis:', error);
    return null;
  }
}

async function saveGameState(username, gameState) {
  const key = `${GAME_STATE_KEY_PREFIX}${username}`;
  const stateJson = JSON.stringify(gameState);
  return await set(key, stateJson, GAME_STATE_TTL);
}

async function deleteGameState(username) {
  const key = `${GAME_STATE_KEY_PREFIX}${username}`;
  return await del(key);
}

function drawCard() {
  const rank = Math.floor(Math.random() * 13) + 1;
  const suits = ['♥', '♦', '♣', '♠'];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  return { rank, suit };
}

function scoreHand(hand) {
  let score = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === 1) {
      aces++;
      score += 11;
    } else if (card.rank > 10) {
      score += 10;
    } else {
      score += card.rank;
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

// Determine game result and payout
async function determineGameResult(playerScore, dealerScore, betAmount) {
  let result = 'lose';
  let payout = 0;

  if (playerScore > 21) {
    result = 'bust';
    payout = 0;
  } else if (dealerScore > 21) {
    result = 'win';
    payout = betAmount * 2; // return stake + win
  } else if (playerScore > dealerScore) {
    result = 'win';
    payout = betAmount * 2;
  } else if (playerScore === dealerScore) {
    result = 'push';
    payout = betAmount; // return stake only
  } else {
    result = 'lose';
    payout = 0;
  }

  // Apply house advantage feature flag if enabled
  // This reduces win probability by 25% when the casino is losing too much money
  // Note: This only applies to regular wins, not natural blackjacks (handled separately)
  if (result === 'win') {
    const houseAdvantageEnabled = await getFeatureFlag('casino.house-advantage', false);
    if (houseAdvantageEnabled) {
      // 25% chance to convert a win into a loss (house advantage)
      if (Math.random() < 0.25) {
        result = 'lose';
        payout = 0;
        console.log(`[Blackjack] 🏠 House advantage applied: win converted to loss`);
      }
    }
  }

  // Check for natural blackjack (21 with 2 cards)
  return { result, payout };
}

// gRPC Service Implementation
class BlackjackServiceImpl {
  async Health(call, callback) {
    const serviceName = process.env.SERVICE_NAME || 'vegas-blackjack-service';
    callback(null, {
      status: 'ok',
      service: serviceName,
      metadata: {
        version: '2.1.0',
        gameType: 'blackjack-21',
        gameCategory: 'card-games',
        complexity: 'high',
        rtp: '99.5%',
        maxPayout: '2.5x',
        owner: 'Card-Games-Team',
        technology: 'Node.js-Express-Blackjack'
      }
    });
  }

  async Deal(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_deal', undefined, extractedContext);
    
    const { bet_amount, username } = call.request;
    const betAmount = bet_amount || 10;
    const Username = username || 'Anonymous';

    // Log game start
    logger.logGameStart('blackjack', Username, betAmount, {
      action: 'deal'
    });

    // Get feature flags for gameplay visibility
    const doubleDownEnabled = await getFeatureFlag('blackjack.double-down', true);
    const insuranceEnabled = await getFeatureFlag('blackjack.insurance', true);
    const surrenderEnabled = await getFeatureFlag('blackjack.surrender', false);

    span.setAttributes({
      'game.action': 'deal',
      'game.bet_amount': betAmount,
      'feature_flag.double_down': doubleDownEnabled,
      'feature_flag.insurance': insuranceEnabled,
      'feature_flag.surrender': surrenderEnabled,
    });

    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];
    
    // Store game state in Redis (primary source of truth)
    const gameState = {
      playerHand,
      dealerHand,
      betAmount,
      gameStatus: 'playing', // playing, finished, dealer_turn
      timestamp: new Date().toISOString(),
    };
    
    console.log(`[Blackjack] 💾 Saving game state for user "${Username}" with key: ${GAME_STATE_KEY_PREFIX}${Username}`);
    await saveGameState(Username, gameState);
    console.log(`[Blackjack] ✅ Game state saved successfully for user "${Username}"`);

    const playerScore = scoreHand(playerHand);
    const dealerScore = scoreHand([dealerHand[0]]); // Only show first dealer card initially
    
    // Check for natural blackjack
    const isNaturalBlackjack = playerScore === 21 && playerHand.length === 2;
    if (isNaturalBlackjack) {
      gameState.gameStatus = 'finished';
      const dealerActualScore = scoreHand(dealerHand);
      const dealerNaturalBlackjack = dealerActualScore === 21 && dealerHand.length === 2;
      
      if (dealerNaturalBlackjack) {
        gameState.result = 'push';
        gameState.payout = betAmount;
      } else {
        gameState.result = 'blackjack';
        gameState.payout = Math.floor(betAmount * 2.5); // Natural blackjack pays 3:2
        
        // Check house advantage feature flag for natural blackjack
        const houseAdvantageEnabled = await getFeatureFlag('casino.house-advantage', false);
        if (houseAdvantageEnabled && Math.random() < 0.25) {
          // 25% chance to convert natural blackjack into a loss
          gameState.result = 'lose';
          gameState.payout = 0;
          console.log(`[Blackjack] 🏠 House advantage applied: natural blackjack converted to loss`);
        }
      }
      gameState.dealerScore = dealerActualScore;
      await saveGameState(Username, gameState);
      
      // Check house advantage feature flag for natural blackjack
      const houseAdvantageEnabled = await getFeatureFlag('casino.house-advantage', false);
      if (houseAdvantageEnabled) {
        span.setAttribute('feature_flag.house_advantage', true);
      }
      
      // Record game result in scoring service for ALL games (wins and losses) to track total bets
      // Natural blackjack is a win, but we record all deals to track total bets
      recordGameResult({
        username: Username,
        game: 'blackjack',
        action: 'deal',
        betAmount: betAmount,
        payout: gameState.payout,
        win: gameState.result === 'blackjack' && gameState.payout > betAmount,
        result: gameState.result,
        gameData: {
          playerHand: playerHand,
          dealerHand: dealerHand,
          playerScore: playerScore,
          dealerScore: dealerActualScore,
          naturalBlackjack: true,
        },
        metadata: {
          timestamp: new Date().toISOString(),
        },
      }).catch(err => console.warn('Failed to record game result:', err));
    }

    span.setAttributes({
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.natural_blackjack': isNaturalBlackjack,
    });
    span.end();

    callback(null, {
      player_hand: playerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      dealer_hand: dealerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      player_score: playerScore,
      dealer_score: dealerScore,
      bet_amount: betAmount,
      game_status: gameState.gameStatus,
      result: gameState.result || null,
      payout: gameState.payout || null,
      timestamp: new Date().toISOString()
    });
  }

  async Hit(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_hit', undefined, extractedContext);
    
    const { username } = call.request;
    const Username = username || 'Anonymous';
    
    // Load game state from Redis
    const gameState = await getGameState(Username);
    
    // Enhanced validation with detailed logging
    if (!gameState) {
      console.error(`[Blackjack] Hit failed: No game state found for user ${Username}`);
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'no_game_state');
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No active hand - game state not found' });
    }
    
    if (gameState.gameStatus !== 'playing') {
      console.warn(`[Blackjack] Hit failed: Invalid game status '${gameState.gameStatus}' for user ${Username}. Expected 'playing'. State:`, JSON.stringify(gameState));
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'invalid_game_status');
      span.setAttribute('game.status', gameState.gameStatus);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: `No active hand - game status is '${gameState.gameStatus}', expected 'playing'` });
    }
    
    // Validate that player has cards
    if (!gameState.playerHand || gameState.playerHand.length === 0) {
      console.error(`[Blackjack] Hit failed: No player cards found for user ${Username}. State:`, JSON.stringify(gameState));
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'no_player_cards');
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No active hand - no player cards found' });
    }
    
    console.log(`[Blackjack] ✅ Hit validated for user ${Username}. Status: ${gameState.gameStatus}, Player cards: ${gameState.playerHand.length}`);

    // Log game action
    logger.logGameAction('hit', 'blackjack', {
      username: Username,
      bet_amount: gameState.betAmount
    });

    const newCard = drawCard();
    gameState.playerHand.push(newCard);
    const playerScore = scoreHand(gameState.playerHand);
    const dealerScore = scoreHand([gameState.dealerHand[0]]);

    // Check if player busts
    if (playerScore > 21) {
      gameState.gameStatus = 'finished';
      gameState.result = 'bust';
      gameState.payout = 0;
      gameState.playerScore = playerScore;
      gameState.dealerScore = scoreHand(gameState.dealerHand);
    } else if (playerScore === 21) {
      // Player has 21, auto-stand (frontend will handle this)
      gameState.playerScore = playerScore;
    } else {
      gameState.playerScore = playerScore;
    }

    // Update game state in Redis
    await saveGameState(Username, gameState);

    span.setAttributes({
      'game.action': 'hit',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.busted': playerScore > 21,
    });
    span.end();

    callback(null, {
      new_card: { rank: newCard.rank, suit: newCard.suit },
      player_hand: gameState.playerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      player_score: playerScore,
      dealer_score: dealerScore,
      game_status: gameState.gameStatus,
      result: gameState.result || null,
      payout: gameState.payout || null,
      timestamp: new Date().toISOString()
    });
  }

  async Stand(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_stand', undefined, extractedContext);
    
    const { username } = call.request;
    const Username = username || 'Anonymous';
    
    console.log(`[Blackjack] 📖 Stand called for user "${Username}", attempting to load game state with key: ${GAME_STATE_KEY_PREFIX}${Username}`);
    
    // Load game state from Redis
    const gameState = await getGameState(Username);
    
    if (gameState) {
      console.log(`[Blackjack] ✅ Game state found for user "${Username}": status=${gameState.gameStatus}, playerCards=${gameState.playerHand?.length || 0}, dealerCards=${gameState.dealerHand?.length || 0}`);
    }
    
    // Enhanced validation with detailed logging
    if (!gameState) {
      console.error(`[Blackjack] Stand failed: No game state found for user "${Username}"`);
      console.error(`[Blackjack] Attempted to load state from Redis key: ${GAME_STATE_KEY_PREFIX}${Username}`);
      console.error(`[Blackjack] This could mean:`);
      console.error(`[Blackjack]   1. Game state expired (TTL: ${GAME_STATE_TTL}s)`);
      console.error(`[Blackjack]   2. Username mismatch between Deal and Stand`);
      console.error(`[Blackjack]   3. Game state was deleted prematurely`);
      console.error(`[Blackjack]   4. Redis connection issue`);
      
      // Make this a more graceful error - return a response that indicates no active game
      // instead of a hard error, so the frontend can handle it gracefully
      span.setAttribute('http.status_code', 200);
      span.setAttribute('error.reason', 'no_game_state');
      span.setAttribute('game.status', 'no_state');
      span.end();
      
      // Return a response indicating no active game (frontend will handle this gracefully)
      return callback(null, {
        dealer_final_hand: [],
        player_hand: [],
        dealer_score: 0,
        player_score: 0,
        result: 'no_active_game',
        payout: 0,
        game_status: 'no_state',
        timestamp: new Date().toISOString()
      });
    }
    
    if (gameState.gameStatus === 'finished') {
      // Make Stand idempotent: if the game is already finished, return the
      // final state instead of treating this as an error. This prevents 500s
      // when the UI accidentally sends an extra Stand (e.g. auto-stand + click).
      console.warn(
        `[Blackjack] Stand called but game already finished for user ${Username}. Returning final state instead of error.`
      );
      span.setAttribute('http.status_code', 200);
      span.setAttribute('error.reason', 'game_already_finished');
      span.setAttribute('game.status', gameState.gameStatus);
      span.end();

      const playerScoreFinal =
        typeof gameState.playerScore === 'number'
          ? gameState.playerScore
          : scoreHand(gameState.playerHand || []);
      const dealerScoreFinal =
        typeof gameState.dealerScore === 'number'
          ? gameState.dealerScore
          : scoreHand(gameState.dealerHand || []);

      return callback(null, {
        dealer_final_hand: (gameState.dealerHand || []).map(c => ({ rank: c.rank, suit: c.suit })),
        player_hand: (gameState.playerHand || []).map(c => ({ rank: c.rank, suit: c.suit })),
        dealer_score: dealerScoreFinal,
        player_score: playerScoreFinal,
        result: gameState.result || 'unknown',
        payout: gameState.payout || 0,
        timestamp: new Date().toISOString()
      });
    }
    
    // Allow stand only if game is in 'playing' state (not 'dealer_turn' or 'finished')
    if (gameState.gameStatus !== 'playing') {
      console.warn(`[Blackjack] Stand failed: Invalid game status '${gameState.gameStatus}' for user ${Username}. Expected 'playing'. State:`, JSON.stringify(gameState));
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'invalid_game_status');
      span.setAttribute('game.status', gameState.gameStatus);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: `No active hand - game status is '${gameState.gameStatus}', expected 'playing'` });
    }
    
    // Validate that player has cards
    if (!gameState.playerHand || gameState.playerHand.length === 0) {
      console.error(`[Blackjack] Stand failed: No player cards found for user ${Username}. State:`, JSON.stringify(gameState));
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'no_player_cards');
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No active hand - no player cards found' });
    }
    
    console.log(`[Blackjack] ✅ Stand validated for user ${Username}. Status: ${gameState.gameStatus}, Player cards: ${gameState.playerHand.length}`);

    // Dealer's turn - draw until 17 or higher
    gameState.gameStatus = 'dealer_turn';
    while (scoreHand(gameState.dealerHand) < 17) {
      gameState.dealerHand.push(drawCard());
    }

    const playerScore = scoreHand(gameState.playerHand);
    const dealerScore = scoreHand(gameState.dealerHand);
    
    // Check house advantage feature flag
    const houseAdvantageEnabled = await getFeatureFlag('casino.house-advantage', false);
    if (houseAdvantageEnabled) {
      span.setAttribute('feature_flag.house_advantage', true);
    }
    
    // Determine result (with house advantage check if enabled)
    const { result, payout } = await determineGameResult(playerScore, dealerScore, gameState.betAmount);
    
    gameState.gameStatus = 'finished';
    gameState.result = result;
    gameState.payout = payout;
    gameState.playerScore = playerScore;
    gameState.dealerScore = dealerScore;

    // Log game end
    logger.logGameEnd('blackjack', Username, result, payout, result === 'win', {
      action: 'stand',
      bet_amount: gameState.betAmount,
      player_score: playerScore,
      dealer_score: dealerScore
    });

    // Record game result in scoring service for ALL games (wins and losses) to track total bets
    recordGameResult({
      username: Username,
      game: 'blackjack',
      action: 'stand',
      betAmount: gameState.betAmount,
      payout: payout,
      win: result === 'win',
      result: result,
      gameData: {
        playerHand: gameState.playerHand,
        dealerHand: gameState.dealerHand,
        playerScore: playerScore,
        dealerScore: dealerScore,
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    }).catch(err => console.warn('Failed to record game result:', err));

    // Save final state immediately so frontend can fetch it if needed
    await saveGameState(Username, gameState);
    console.log(`[Blackjack] ✅ Stand completed for user ${Username}. Result: ${result}, Payout: ${payout}, Game status: ${gameState.gameStatus}`);
    
    // Delete game state after a short delay (30 seconds) to allow frontend to fetch final result
    // But keep it long enough to prevent race conditions
    setTimeout(() => {
      deleteGameState(Username).catch(err => console.warn('Failed to delete game state:', err));
      console.log(`[Blackjack] 🗑️ Game state deleted for user ${Username} after stand completion`);
    }, 30 * 1000); // Reduced from 5 minutes to 30 seconds to prevent stale state issues

    span.setAttributes({
      'game.action': 'stand',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.result': result,
      'game.payout': payout,
    });
    span.end();

    callback(null, {
      dealer_final_hand: gameState.dealerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      player_hand: gameState.playerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      dealer_score: dealerScore,
      player_score: playerScore,
      result: result,
      payout: payout,
      timestamp: new Date().toISOString()
    });
  }

  async Double(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_double', undefined, extractedContext);
    
    const { username } = call.request;
    const Username = username || 'Anonymous';
    
    // Load game state from Redis
    const gameState = await getGameState(Username);
    
    // Enhanced validation with detailed logging
    if (!gameState) {
      console.error(`[Blackjack] Double failed: No game state found for user ${Username}`);
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'no_game_state');
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Cannot double down - invalid game state' });
    }
    
    if (gameState.gameStatus !== 'playing') {
      console.warn(`[Blackjack] Double failed: Game status is '${gameState.gameStatus}' for user ${Username}, expected 'playing'`);
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'invalid_game_status');
      span.setAttribute('game.status', gameState.gameStatus);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Cannot double down - invalid game state' });
    }
    
    if (!gameState.playerHand || gameState.playerHand.length !== 2) {
      const handLength = gameState.playerHand ? gameState.playerHand.length : 0;
      console.warn(`[Blackjack] Double failed: Player has ${handLength} cards for user ${Username}, need exactly 2`);
      span.setAttribute('http.status_code', 400);
      span.setAttribute('error.reason', 'invalid_hand_length');
      span.setAttribute('player_hand_length', handLength);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Cannot double down - invalid game state' });
    }
    
    console.log(`[Blackjack] ✅ Double validated for user ${Username}. Status: ${gameState.gameStatus}, Player cards: ${gameState.playerHand.length}`);

    // Check if double-down feature is enabled
    const doubleDownEnabled = await getFeatureFlag('blackjack.double-down', true);
    if (!doubleDownEnabled) {
      span.setAttribute('http.status_code', 403);
      span.setAttribute('feature_flag.blocked', true);
      span.end();
      logger.logWarning('Double-down feature blocked by feature flag', { username: Username });
      return callback({ code: grpc.status.PERMISSION_DENIED, message: 'Double-down feature is disabled' });
    }

    // Log bet change (double down)
    const additionalBet = gameState.betAmount;
    logger.logBetChange('blackjack', Username, gameState.betAmount, gameState.betAmount * 2, 'double_down');

    const newCard = drawCard();
    gameState.playerHand.push(newCard);
    gameState.betAmount *= 2;
    const playerScore = scoreHand(gameState.playerHand);
    const dealerScore = scoreHand([gameState.dealerHand[0]]);
    
    // After double, player must stand - check if busted
    if (playerScore > 21) {
      gameState.gameStatus = 'finished';
      gameState.result = 'bust';
      gameState.payout = 0;
      gameState.playerScore = playerScore;
      gameState.dealerScore = scoreHand(gameState.dealerHand);
      } else {
        // Player must stand after double - dealer plays
        gameState.gameStatus = 'dealer_turn';
        while (scoreHand(gameState.dealerHand) < 17) {
          gameState.dealerHand.push(drawCard());
        }
        
        // Check house advantage feature flag
        const houseAdvantageEnabled = await getFeatureFlag('casino.house-advantage', false);
        if (houseAdvantageEnabled) {
          span.setAttribute('feature_flag.house_advantage', true);
        }
        
        const finalDealerScore = scoreHand(gameState.dealerHand);
        const { result, payout } = await determineGameResult(playerScore, finalDealerScore, gameState.betAmount);
        gameState.gameStatus = 'finished';
        gameState.result = result;
        gameState.payout = payout;
        gameState.playerScore = playerScore;
        gameState.dealerScore = finalDealerScore;
      }
    
    // Log game action
    logger.logGameAction('double', 'blackjack', {
      username: Username,
      bet_amount: gameState.betAmount,
      additional_bet: additionalBet
    });

    // Record game result in scoring service for ALL games (wins and losses) to track total bets
    recordGameResult({
      username: Username,
      game: 'blackjack',
      action: 'double',
      betAmount: gameState.betAmount,
      payout: gameState.payout,
      win: gameState.result === 'win' && gameState.payout > 0,
      result: gameState.result,
      gameData: {
        playerHand: gameState.playerHand,
        dealerHand: gameState.dealerHand,
        playerScore: gameState.playerScore,
        dealerScore: gameState.dealerScore,
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    }).catch(err => console.warn('Failed to record game result:', err));

    // Update game state in Redis
    await saveGameState(Username, gameState);
    
    // Delete game state after 5 minutes
    setTimeout(() => {
      deleteGameState(Username).catch(err => console.warn('Failed to delete game state:', err));
    }, 5 * 60 * 1000);

    span.setAttributes({
      'game.action': 'double',
      'game.additional_bet': additionalBet,
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.result': gameState.result || null,
      'game.payout': gameState.payout || null,
    });
    span.end();

    callback(null, {
      new_card: { rank: newCard.rank, suit: newCard.suit },
      player_hand: gameState.playerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      dealer_final_hand: gameState.dealerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      player_score: playerScore,
      dealer_score: gameState.dealerScore,
      additional_bet: additionalBet,
      game_status: gameState.gameStatus,
      result: gameState.result || null,
      payout: gameState.payout || null,
      timestamp: new Date().toISOString()
    });
  }

  async GetGameAssets(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_get_game_assets', undefined, extractedContext);
    
    try {
      // Get feature flags for game configuration
      const doubleDownEnabled = await getFeatureFlag('blackjack.double-down', true);
    const insuranceEnabled = await getFeatureFlag('blackjack.insurance', true);
    const surrenderEnabled = await getFeatureFlag('blackjack.surrender', false);
    
    const html = generateBlackjackHTML();
    const js = generateBlackjackJS(doubleDownEnabled, insuranceEnabled, surrenderEnabled);
    const css = generateBlackjackCSS();
    
    const config = {
      service_endpoint: process.env.SERVICE_ENDPOINT || 'localhost:50054',
      game_name: 'Blackjack',
      game_type: 'blackjack-21',
      min_bet: '10',
      max_bet: '1000',
      double_down_enabled: doubleDownEnabled,
      insurance_enabled: insuranceEnabled,
      surrender_enabled: surrenderEnabled
    };

      span.setAttributes({
        'game.asset_type': 'all',
        'feature_flag.double_down': doubleDownEnabled,
        'feature_flag.insurance': insuranceEnabled,
        'feature_flag.surrender': surrenderEnabled,
      });
      span.end();
      
      callback(null, {
        html: html,
        javascript: js,
        css: css,
        config: config
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  }
}

function generateBlackjackHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blackjack Game</title>
    <link rel="stylesheet" href="https://cdn.tailwindcss.com">
</head>
<body class="bg-green-900 text-white p-4">
    <div id="blackjack-game-container" class="max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-4 text-center">🃏 Blackjack</h1>
        <div id="game-area" class="mb-4">
            <div id="player-hand" class="mb-4">
                <h2 class="text-xl mb-2">Your Hand</h2>
                <div id="player-cards" class="flex gap-2"></div>
                <div id="player-score" class="mt-2"></div>
            </div>
            <div id="dealer-hand">
                <h2 class="text-xl mb-2">Dealer Hand</h2>
                <div id="dealer-cards" class="flex gap-2"></div>
                <div id="dealer-score" class="mt-2"></div>
            </div>
        </div>
        <div id="controls" class="mb-4">
            <div class="mb-4">
                <label class="block mb-2">Bet Amount:</label>
                <input type="number" id="bet-amount" value="10" min="10" max="1000" class="w-full p-2 bg-gray-800 text-white rounded">
            </div>
            <button id="deal-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg mb-2">
                Deal
            </button>
            <div id="game-buttons" class="hidden flex gap-2">
                <button id="hit-btn" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">
                    Hit
                </button>
                <button id="stand-btn" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">
                    Stand
                </button>
                <button id="double-btn" class="flex-1 bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded" style="display: none;">
                    Double
                </button>
                <button id="insurance-btn" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" style="display: none;">
                    Insurance
                </button>
                <button id="surrender-btn" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded" style="display: none;">
                    Surrender
                </button>
            </div>
        </div>
        <div id="result" class="mt-4 text-center"></div>
    </div>
    <script src="/blackjack-game.js"></script>
</body>
</html>`;
}

function generateBlackjackJS(doubleDownEnabled = true, insuranceEnabled = true, surrenderEnabled = false) {
  return `
// Blackjack Game JavaScript
let currentGame = null;
const DOUBLE_DOWN_ENABLED = ${doubleDownEnabled};
const INSURANCE_ENABLED = ${insuranceEnabled};
const SURRENDER_ENABLED = ${surrenderEnabled};

async function initBlackjackGame() {
    document.getElementById('deal-btn').addEventListener('click', async () => {
        const betAmount = parseFloat(document.getElementById('bet-amount').value);
        const username = 'player-' + Date.now();
        
        try {
            const response = await callBlackjackService('Deal', {
                bet_amount: betAmount,
                username: username
            });
            
            currentGame = { username, betAmount };
            displayHands(response);
            document.getElementById('deal-btn').classList.add('hidden');
            document.getElementById('game-buttons').classList.remove('hidden');
        } catch (error) {
            console.error('Error dealing:', error);
        }
    });
    
    document.getElementById('hit-btn').addEventListener('click', async () => {
        try {
            const response = await callBlackjackService('Hit', {
                username: currentGame.username
            });
            displayHands(response);
        } catch (error) {
            console.error('Error hitting:', error);
        }
    });
    
    document.getElementById('stand-btn').addEventListener('click', async () => {
        try {
            const response = await callBlackjackService('Stand', {
                username: currentGame.username
            });
            displayFinalResult(response);
            resetGame();
        } catch (error) {
            console.error('Error standing:', error);
        }
    });
    
    if (DOUBLE_DOWN_ENABLED) {
        document.getElementById('double-btn').style.display = 'block';
        document.getElementById('double-btn').addEventListener('click', async () => {
            try {
                const response = await callBlackjackService('Double', {
                    username: currentGame.username
                });
                displayHands(response);
            } catch (error) {
                console.error('Error doubling:', error);
            }
        });
    }
    
    if (INSURANCE_ENABLED) {
        document.getElementById('insurance-btn').style.display = 'block';
    }
    
    if (SURRENDER_ENABLED) {
        document.getElementById('surrender-btn').style.display = 'block';
    }
}

function displayHands(data) {
    // Display player hand
    const playerCards = document.getElementById('player-cards');
    playerCards.innerHTML = '';
    if (data.player_hand) {
        data.player_hand.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'w-16 h-24 bg-white text-black rounded p-2 text-center';
            cardEl.textContent = getCardDisplay(card);
            playerCards.appendChild(cardEl);
        });
    }
    document.getElementById('player-score').textContent = 'Score: ' + (data.player_score || 0);
}

function displayFinalResult(data) {
    // Display dealer final hand
    const dealerCards = document.getElementById('dealer-cards');
    dealerCards.innerHTML = '';
    if (data.dealer_final_hand) {
        data.dealer_final_hand.forEach(card => {
            const cardEl = document.createElement('div');
            cardEl.className = 'w-16 h-24 bg-white text-black rounded p-2 text-center';
            cardEl.textContent = getCardDisplay(card);
            dealerCards.appendChild(cardEl);
        });
    }
    document.getElementById('dealer-score').textContent = 'Score: ' + (data.dealer_score || 0);
    
    const resultEl = document.getElementById('result');
    if (data.result === 'win') {
        resultEl.innerHTML = '<div class="text-green-500 text-xl">🎉 You Win! Payout: $' + data.payout.toFixed(2) + '</div>';
    } else if (data.result === 'push') {
        resultEl.innerHTML = '<div class="text-yellow-500 text-xl">Push! Payout: $' + data.payout.toFixed(2) + '</div>';
    } else {
        resultEl.innerHTML = '<div class="text-red-500 text-xl">You Lose</div>';
    }
}

function getCardDisplay(card) {
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    return ranks[card.rank - 1] + card.suit;
}

function resetGame() {
    currentGame = null;
    document.getElementById('deal-btn').classList.remove('hidden');
    document.getElementById('game-buttons').classList.add('hidden');
}

async function callBlackjackService(method, data) {
    const response = await fetch(\`/api/blackjack/\${method.toLowerCase()}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await response.json();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBlackjackGame);
} else {
    initBlackjackGame();
}
`;
}

function generateBlackjackCSS() {
  return `
#blackjack-game-container {
    font-family: 'Inter', sans-serif;
}
`;
}

// Start HTTP service
const blackjackMetadata = {
  version: '2.1.0',
  gameType: 'blackjack-21',
  complexity: 'high',
  rtp: '99.5%',
  owner: 'Card-Games-Team',
  technology: 'Node.js-Express-Blackjack',
  maxPayout: '2.5x'
};

createService(process.env.SERVICE_NAME || 'vegas-blackjack-service', (app) => {
  app.post('/deal', async (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_deal');
    
    try {
      const p = req.body || {};
      const betAmount = Number(p.BetAmount || 10);
      const Username = p.Username || 'Anonymous';
      
      const playerHand = [drawCard(), drawCard()];
      const dealerHand = [drawCard(), drawCard()];
      
      // Store game state in Redis
      const gameState = {
        playerHand,
        dealerHand,
        betAmount,
        gameStatus: 'playing',
        timestamp: new Date().toISOString(),
      };
      await saveGameState(Username, gameState);

      const playerScore = scoreHand(playerHand);
      const dealerScore = scoreHand([dealerHand[0]]);
      
      // Check for natural blackjack
      const isNaturalBlackjack = playerScore === 21 && playerHand.length === 2;
      if (isNaturalBlackjack) {
        gameState.gameStatus = 'finished';
        const dealerActualScore = scoreHand(dealerHand);
        const dealerNaturalBlackjack = dealerActualScore === 21 && dealerHand.length === 2;
        
        if (dealerNaturalBlackjack) {
          gameState.result = 'push';
          gameState.payout = betAmount;
        } else {
          gameState.result = 'blackjack';
          gameState.payout = Math.floor(betAmount * 2.5);
        }
        gameState.dealerScore = dealerActualScore;
        await saveGameState(Username, gameState);
      }

      span.setAttributes({
        'game.action': 'deal',
        'game.bet_amount': betAmount,
        'game.player_score': playerScore,
        'game.dealer_score': dealerScore,
        'game.natural_blackjack': isNaturalBlackjack,
      });
      span.end();

      res.json({
        playerHand,
        dealerHand,
        playerScore,
        dealerScore,
        betAmount,
        gameStatus: gameState.gameStatus,
        result: gameState.result || null,
        payout: gameState.payout || null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/hit', async (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_hit');
    
    try {
      const p = req.body || {};
      const Username = p.Username || 'Anonymous';
      
      const gameState = await getGameState(Username);
      if (!gameState || gameState.gameStatus !== 'playing') {
        span.setAttribute('http.status_code', 400);
        span.end();
        return res.status(400).json({ error: 'No active hand' });
      }
      
      const newCard = drawCard();
      gameState.playerHand.push(newCard);
      const playerScore = scoreHand(gameState.playerHand);
      const dealerScore = scoreHand([gameState.dealerHand[0]]);
      
      // Check if player busts
      if (playerScore > 21) {
        gameState.gameStatus = 'finished';
        gameState.result = 'bust';
        gameState.payout = 0;
        gameState.playerScore = playerScore;
        gameState.dealerScore = scoreHand(gameState.dealerHand);
      } else {
        gameState.playerScore = playerScore;
      }
      
      await saveGameState(Username, gameState);
      
      span.setAttributes({
        'game.action': 'hit',
        'game.player_score': playerScore,
        'game.dealer_score': dealerScore,
        'game.busted': playerScore > 21,
      });
      span.end();
      
      res.json({
        newCard,
        playerHand: gameState.playerHand,
        playerScore,
        dealerScore,
        gameStatus: gameState.gameStatus,
        result: gameState.result || null,
        payout: gameState.payout || null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/stand', async (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_stand');
    
    try {
      const p = req.body || {};
      const Username = p.Username || 'Anonymous';
      
      const gameState = await getGameState(Username);
      if (!gameState || gameState.gameStatus === 'finished') {
        span.setAttribute('http.status_code', 400);
        span.end();
        return res.status(400).json({ error: 'No active hand' });
      }
      
      // Dealer's turn
      gameState.gameStatus = 'dealer_turn';
      while (scoreHand(gameState.dealerHand) < 17) {
        gameState.dealerHand.push(drawCard());
      }
      
      const playerScore = scoreHand(gameState.playerHand);
      const dealerScore = scoreHand(gameState.dealerHand);
      const { result, payout } = await determineGameResult(playerScore, dealerScore, gameState.betAmount);

      gameState.gameStatus = 'finished';
      gameState.result = result;
      gameState.payout = payout;
      gameState.playerScore = playerScore;
      gameState.dealerScore = dealerScore;

      await saveGameState(Username, gameState);

      // Delete after 5 minutes
      setTimeout(() => {
        deleteGameState(Username).catch(err => console.warn('Failed to delete game state:', err));
      }, 5 * 60 * 1000);

      span.setAttributes({
        'game.action': 'stand',
        'game.player_score': playerScore,
        'game.dealer_score': dealerScore,
        'game.result': result,
        'game.payout': payout,
      });
      span.end();

      res.json({
        dealerFinalHand: gameState.dealerHand,
        playerHand: gameState.playerHand,
        dealerScore,
        playerScore,
        result,
        payout,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/double', async (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_double');
    
    try {
      const p = req.body || {};
      const Username = p.Username || 'Anonymous';
      
      const gameState = await getGameState(Username);
      if (!gameState || gameState.gameStatus !== 'playing' || gameState.playerHand.length !== 2) {
        span.setAttribute('http.status_code', 400);
        span.end();
        return res.status(400).json({ error: 'Cannot double down - invalid game state' });
      }

      // Check if double-down feature is enabled
      const doubleDownEnabled = await getFeatureFlag('blackjack.double-down', true);
      if (!doubleDownEnabled) {
        span.setAttribute('http.status_code', 403);
        span.setAttribute('feature_flag.blocked', true);
        span.end();
        return res.status(403).json({ error: 'Double-down feature is disabled' });
      }
      
      const newCard = drawCard();
      gameState.playerHand.push(newCard);
      const additionalBet = gameState.betAmount;
      gameState.betAmount *= 2;
      const playerScore = scoreHand(gameState.playerHand);
      const dealerScore = scoreHand([gameState.dealerHand[0]]);
      
      // After double, player must stand
      if (playerScore > 21) {
        gameState.gameStatus = 'finished';
        gameState.result = 'bust';
        gameState.payout = 0;
        gameState.playerScore = playerScore;
        gameState.dealerScore = scoreHand(gameState.dealerHand);
      } else {
        // Dealer plays
        gameState.gameStatus = 'dealer_turn';
        while (scoreHand(gameState.dealerHand) < 17) {
          gameState.dealerHand.push(drawCard());
        }
        const finalDealerScore = scoreHand(gameState.dealerHand);
        const { result, payout } = await determineGameResult(playerScore, finalDealerScore, gameState.betAmount);
        gameState.gameStatus = 'finished';
        gameState.result = result;
        gameState.payout = payout;
        gameState.playerScore = playerScore;
        gameState.dealerScore = finalDealerScore;
      }

      await saveGameState(Username, gameState);

      // Delete after 5 minutes
      setTimeout(() => {
        deleteGameState(Username).catch(err => console.warn('Failed to delete game state:', err));
      }, 5 * 60 * 1000);

      span.setAttributes({
        'game.action': 'double',
        'game.additional_bet': additionalBet,
        'game.player_score': playerScore,
        'game.dealer_score': dealerScore,
        'game.result': gameState.result || null,
        'game.payout': gameState.payout || null,
      });
      span.end();

      res.json({
        newCard,
        playerHand: gameState.playerHand,
        dealerFinalHand: gameState.dealerHand,
        playerScore,
        dealerScore: gameState.dealerScore,
        additionalBet,
        gameStatus: gameState.gameStatus,
        result: gameState.result || null,
        payout: gameState.payout || null,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      res.status(500).json({ error: error.message });
    }
  });
}, blackjackMetadata);

// Start gRPC server
const GRPC_PORT = process.env.GRPC_PORT || 50054;
const server = new grpc.Server();

server.addService(blackjackProto.BlackjackService.service, new BlackjackServiceImpl());
server.bindAsync(
  `0.0.0.0:${GRPC_PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to start gRPC server:', err);
      return;
    }
    console.log(`🃏 Blackjack gRPC server listening on port ${port}`);
    server.start();
  }
);

