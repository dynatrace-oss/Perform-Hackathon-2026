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

// Game state management
const games = new Map();

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
    games.set(Username, { playerHand, dealerHand, betAmount });

    // Store game state in Redis
    const gameStateKey = `blackjack:${Username}:state`;
    await set(gameStateKey, JSON.stringify({
      playerHand,
      dealerHand,
      betAmount,
      timestamp: new Date().toISOString(),
    }), 3600); // Expire after 1 hour

    const playerScore = scoreHand(playerHand);
    const dealerScore = scoreHand(playerHand) >= 21 ? scoreHand(dealerHand) : scoreHand([dealerHand[0]]);

    span.setAttributes({
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();

    callback(null, {
      player_hand: playerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      dealer_hand: dealerHand.map(c => ({ rank: c.rank, suit: c.suit })),
      player_score: playerScore,
      dealer_score: dealerScore,
      bet_amount: betAmount,
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
    const g = games.get(Username);

    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No active hand' });
    }

    // Log game action
    logger.logGameAction('hit', 'blackjack', {
      username: Username,
      bet_amount: g.betAmount
    });

    const newCard = drawCard();
    g.playerHand.push(newCard);
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand([g.dealerHand[0]]);

    // Update game state in Redis
    const gameStateKey = `blackjack:${Username}:state`;
    await set(gameStateKey, JSON.stringify({
      playerHand: g.playerHand,
      dealerHand: g.dealerHand,
      betAmount: g.betAmount,
      timestamp: new Date().toISOString(),
    }), 3600);

    span.setAttributes({
      'game.action': 'hit',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();

    callback(null, {
      new_card: { rank: newCard.rank, suit: newCard.suit },
      player_score: playerScore,
      dealer_score: dealerScore,
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
    const g = games.get(Username);

    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No active hand' });
    }

    while (scoreHand(g.dealerHand) < 17) {
      g.dealerHand.push(drawCard());
    }

    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand(g.dealerHand);
    let result = 'lose';
    if (playerScore > 21) result = 'lose';
    else if (dealerScore > 21 || playerScore > dealerScore) result = 'win';
    else if (playerScore === dealerScore) result = 'push';

    let payout = 0;
    if (result === 'win') payout = g.betAmount * 2;
    else if (result === 'push') payout = g.betAmount;

    // Log game end
    logger.logGameEnd('blackjack', Username, result, payout, result === 'win', {
      action: 'stand',
      bet_amount: g.betAmount,
      player_score: playerScore,
      dealer_score: dealerScore
    });

    // Record game result in scoring service (async, don't block response)
    recordGameResult({
      username: Username,
      game: 'blackjack',
      action: 'stand',
      betAmount: g.betAmount,
      payout: payout,
      win: result === 'win',
      result: result,
      gameData: {
        playerHand: g.playerHand,
        dealerHand: g.dealerHand,
        playerScore: playerScore,
        dealerScore: dealerScore,
      },
      metadata: {
        timestamp: new Date().toISOString(),
      },
    }).catch(err => console.warn('Failed to record game result:', err));

    // Remove game state from Redis
    const gameStateKey = `blackjack:${Username}:state`;
    await del(gameStateKey);

    span.setAttributes({
      'game.action': 'stand',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.result': result,
      'game.payout': payout,
    });
    span.end();

    const dealerFinalHand = g.dealerHand;
    games.delete(Username);

    callback(null, {
      dealer_final_hand: dealerFinalHand.map(c => ({ rank: c.rank, suit: c.suit })),
      dealer_score: dealerScore,
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
    const g = games.get(Username);

    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'No active hand' });
    }

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
    logger.logBetChange('blackjack', Username, g.betAmount, g.betAmount * 2, 'double_down');

    const newCard = drawCard();
    g.playerHand.push(newCard);
    const additionalBet = g.betAmount;
    g.betAmount *= 2;
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand([g.dealerHand[0]]);
    
    // Log game action
    logger.logGameAction('double', 'blackjack', {
      username: Username,
      bet_amount: g.betAmount,
      additional_bet: additionalBet
    });

    span.setAttributes({
      'game.action': 'double',
      'game.additional_bet': additionalBet,
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();

    callback(null, {
      new_card: { rank: newCard.rank, suit: newCard.suit },
      player_score: playerScore,
      dealer_score: dealerScore,
      additional_bet: additionalBet,
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
  app.post('/deal', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_deal');
    
    const p = req.body || {};
    const betAmount = Number(p.BetAmount || 10);
    const Username = p.Username || 'Anonymous';
    const playerHand = [drawCard(), drawCard()];
    const dealerHand = [drawCard(), drawCard()];
    games.set(Username, { playerHand, dealerHand, betAmount });

    span.setAttributes({
      'game.action': 'deal',
      'game.bet_amount': betAmount,
      'game.player_score': scoreHand(playerHand),
      'game.dealer_score': scoreHand(playerHand) >= 21 ? scoreHand(dealerHand) : scoreHand([dealerHand[0]]),
    });
    span.end();

    res.json({
      playerHand,
      dealerHand,
      playerScore: scoreHand(playerHand),
      dealerScore: scoreHand(playerHand) >= 21 ? scoreHand(dealerHand) : scoreHand([dealerHand[0]]),
      betAmount,
      timestamp: new Date().toISOString()
    });
  });

  app.post('/hit', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_hit');
    
    const p = req.body || {};
    const Username = p.Username || 'Anonymous';
    const g = games.get(Username);
    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return res.status(400).json({ error: 'No active hand' });
    }
    
    const newCard = drawCard();
    g.playerHand.push(newCard);
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand([g.dealerHand[0]]);
    
    span.setAttributes({
      'game.action': 'hit',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();
    
    res.json({ newCard, playerScore, dealerScore, timestamp: new Date().toISOString() });
  });

  app.post('/stand', (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_stand');
    
    const p = req.body || {};
    const Username = p.Username || 'Anonymous';
    const g = games.get(Username);
    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return res.status(400).json({ error: 'No active hand' });
    }
    
    while (scoreHand(g.dealerHand) < 17) {
      g.dealerHand.push(drawCard());
    }
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand(g.dealerHand);
    let result = 'lose';
    if (playerScore > 21) result = 'lose';
    else if (dealerScore > 21 || playerScore > dealerScore) result = 'win';
    else if (playerScore === dealerScore) result = 'push';
    let payout = 0;
    if (result === 'win') payout = g.betAmount * 2;
    else if (result === 'push') payout = g.betAmount;
    
    span.setAttributes({
      'game.action': 'stand',
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
      'game.result': result,
      'game.payout': payout,
    });
    span.end();
    
    const dealerFinalHand = g.dealerHand;
    games.delete(Username);
    res.json({ dealerFinalHand, dealerScore, result, payout, timestamp: new Date().toISOString() });
  });

  app.post('/double', async (req, res) => {
    const tracer = trace.getTracer('vegas-blackjack-service');
    const span = tracer.startSpan('blackjack_double');
    
    const p = req.body || {};
    const Username = p.Username || 'Anonymous';
    const g = games.get(Username);
    if (!g) {
      span.setAttribute('http.status_code', 400);
      span.end();
      return res.status(400).json({ error: 'No active hand' });
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
    g.playerHand.push(newCard);
    const additionalBet = g.betAmount;
    g.betAmount *= 2;
    const playerScore = scoreHand(g.playerHand);
    const dealerScore = scoreHand([g.dealerHand[0]]);
    
    span.setAttributes({
      'game.action': 'double',
      'game.additional_bet': additionalBet,
      'game.player_score': playerScore,
      'game.dealer_score': dealerScore,
    });
    span.end();
    
    res.json({ newCard, playerScore, dealerScore, additionalBet, timestamp: new Date().toISOString() });
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

