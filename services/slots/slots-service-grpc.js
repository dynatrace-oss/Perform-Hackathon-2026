/**
 * Slots Service with gRPC Support
 * Provides both HTTP and gRPC endpoints
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { createService } = require('./common/service-runner');
const { trace, context, propagation } = require('@opentelemetry/api');
const { initializeOpenFeature, getFeatureFlag } = require('./common/openfeature');
const { initializeRedis, set, get, del } = require('./common/redis');
const { recordGameResult, recordScore } = require('./common/scoring');
const Logger = require('./common/logger');

// Initialize Redis
initializeRedis();

// Load proto file
const PROTO_PATH = path.join(__dirname, './proto/slots.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const slotsProto = grpc.loadPackageDefinition(packageDefinition).slots;

// Initialize OpenFeature
const featureFlags = initializeOpenFeature('vegas-slots-service');

// Initialize Logger
const logger = new Logger('vegas-slots-service');

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

// Redis key prefix for game state
const GAME_STATE_KEY_PREFIX = 'slots:game:';
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
  const { del } = require('./common/redis');
  const key = `${GAME_STATE_KEY_PREFIX}${username}`;
  return await del(key);
}

// Game logic - using Dynatrace symbols
const icons = ['dynatrace', 'smartscape', 'application', 'database', 'server', 'cloud', 'shield'];

// Payout Matrix
const payoutMatrix = {
  // Triple Matches - ALL 10x Bet Amount (6 Symbols)
  triple: {
    'smartscape': 10,
    'application': 10,
    'database': 10,
    'server': 10,
    'cloud': 10,
    'shield': 10
  },
  // Double Matches - ALL 5x Bet Amount (6 Symbols)
  double: {
    'smartscape': 5,
    'application': 5,
    'database': 5,
    'server': 5,
    'cloud': 5,
    'shield': 5
  },
  // Special Combinations
  special: {
    'dynatrace,dynatrace,dynatrace': 50   // DYNATRACE JACKPOT! (three logos = 50x)
  }
};

function calculateWin(result, betAmount) {
  let winAmount = 0;
  let multiplier = 0;
  let winType = 'none';
  let description = '';
  
  // Check for special combinations first
  const sortedResult = result.slice().sort().join(',');
  if (payoutMatrix.special[sortedResult]) {
    multiplier = payoutMatrix.special[sortedResult];
    winAmount = betAmount * multiplier;
    winType = 'special';
    description = getSpecialComboName(sortedResult);
  } else {
    // Check for matches
    const counts = result.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
    
    // Triple match
    const tripleIcon = Object.keys(counts).find(icon => counts[icon] === 3);
    if (tripleIcon && payoutMatrix.triple[tripleIcon]) {
      multiplier = payoutMatrix.triple[tripleIcon];
      winAmount = betAmount * multiplier;
      winType = 'triple';
      description = getTripleName(tripleIcon);
    } else {
      // Double match
      const doubleIcon = Object.keys(counts).find(icon => counts[icon] === 2);
      if (doubleIcon && payoutMatrix.double[doubleIcon]) {
        multiplier = payoutMatrix.double[doubleIcon];
        winAmount = betAmount * multiplier;
        winType = 'double';
        description = getDoubleName(doubleIcon);
      }
    }
  }
  
  const win = winAmount > 0;
  
  return { win, winAmount, multiplier, winType, description };
}

// Helper functions for win descriptions
function getSpecialComboName(combo) {
  const names = {
    'dynatrace,dynatrace,dynatrace': 'DYNATRACE JACKPOT!'
  };
  return names[combo] || 'SPECIAL COMBO!';
}

function getTripleName(icon) {
  const names = {
    'smartscape': 'TOPOLOGY MASTERY!',
    'application': 'APM BREAKTHROUGH!',
    'database': 'DATA OBSERVABILITY CHAMPION!',
    'server': 'INFRASTRUCTURE MASTERY!',
    'cloud': 'CLOUD-NATIVE SUCCESS!',
    'shield': 'SECURITY OBSERVABILITY EXPERT!'
  };
  return names[icon] || 'TRIPLE WIN!';
}

function getDoubleName(icon) {
  const names = {
    'smartscape': 'Topology Discovery!',
    'application': 'APM Insight!',
    'database': 'Data Connection!',
    'server': 'Infrastructure Pair!',
    'cloud': 'Cloud Duo!',
    'shield': 'Security Alliance!'
  };
  return names[icon] || 'Double Match!';
}

// gRPC Service Implementation
class SlotsServiceImpl {
  async Health(call, callback) {
    const serviceName = process.env.SERVICE_NAME || 'vegas-slots-service';
    callback(null, {
      status: 'ok',
      service: serviceName,
      metadata: {
        version: '2.1.0',
        gameType: 'slots-machine',
        gameCategory: 'slot-machines',
        complexity: 'high',
        rtp: '96.5%',
        maxPayout: '100x',
        owner: 'Gaming-Backend-Team',
        technology: 'Node.js-Express-Slots'
      }
    });
  }

  async Spin(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-slots-service');
    const span = tracer.startSpan('slots_spin', undefined, extractedContext);
    
    const { bet_amount, cheat_active, cheat_type, username } = call.request;
    const betAmount = bet_amount || 10;
    const cheatActive = cheat_active || false;
    const cheatType = cheat_type || '';
    const Username = username || 'Anonymous';

    // Log game start
    logger.logGameStart('slots', Username, betAmount, {
      cheat_active: cheatActive,
      cheat_type: cheatType
    });

    // Get feature flags for gameplay
    const enableProgressiveJackpot = await getFeatureFlag('slots.progressive-jackpot', true);
    const enableBonusRounds = await getFeatureFlag('slots.bonus-rounds', true);
    const enableCheatDetection = await getFeatureFlag('slots.cheat-detection', true);
    const minBet = Number(await getFeatureFlag('slots.min-bet', 10)) || 10;
    const maxBet = Number(await getFeatureFlag('slots.max-bet', 1000)) || 1000;

    // Add game attributes to span
    span.setAttributes({
      'game.action': 'spin',
      'game.bet_amount': betAmount,
      'game.cheat_active': cheatActive,
      'game.username': Username,
      'feature_flag.progressive_jackpot': enableProgressiveJackpot,
      'feature_flag.bonus_rounds': enableBonusRounds,
      'feature_flag.cheat_detection': enableCheatDetection,
      'feature_flag.min_bet': minBet,
      'feature_flag.max_bet': maxBet,
    });

    if (cheatType) {
      span.setAttribute('game.cheat_type', cheatType);
    }
    
    // Validate bet amount against feature flags
    if (betAmount < minBet || betAmount > maxBet) {
      span.setAttribute('http.status_code', 400);
      span.setAttribute('feature_flag.validation_failed', true);
      span.end();
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: `Bet amount must be between ${minBet} and ${maxBet}` });
    }

    // Check house advantage feature flag
    const houseAdvantageEnabled = await getFeatureFlag('casino.house-advantage', false);
    
    // Add feature flag to span
    if (houseAdvantageEnabled) {
      span.setAttribute('feature_flag.house_advantage', true);
      console.log(`[Slots] 🏠 House advantage mode enabled - reducing win probability`);
    }
    
    // Generate random result using Dynatrace symbols
    let result = Array.from({ length: 3 }, () => icons[Math.floor(Math.random() * icons.length)]);
    
    let cheatBoosted = false;
    
    // Apply cheat logic
    if (cheatActive) {
      const megaSymbols = ['dynatrace', 'smartscape', 'application'];
      const premiumSymbols = ['database', 'server', 'cloud'];
      const standardSymbols = ['shield'];
      
      if (cheatType === 'backdoor' && Math.random() < 0.05) {
        // Backdoor has 5% chance for mega special combo
        const megaCombos = [
          ['smartscape', 'application'],
          ['database', 'shield']
        ];
        result = megaCombos[Math.floor(Math.random() * megaCombos.length)];
        cheatBoosted = true;
      } else if ((cheatType === 'timing' || cheatType === 'backdoor') && Math.random() < 0.15) {
        // Premium cheats have 15% chance for mega symbols triple
        const winIcon = megaSymbols[Math.floor(Math.random() * megaSymbols.length)];
        result = [winIcon, winIcon, winIcon];
        cheatBoosted = true;
      } else if (Math.random() < 0.3) {
        // 30% chance for premium triple when cheating
        const winIcon = Math.random() < 0.4 ? 
          megaSymbols[Math.floor(Math.random() * megaSymbols.length)] :
          premiumSymbols[Math.floor(Math.random() * premiumSymbols.length)];
        result = [winIcon, winIcon, winIcon];
        cheatBoosted = true;
      } else {
        // Double match with bias toward higher value symbols
        const winIcon = Math.random() < 0.6 ? 
          [...megaSymbols, ...premiumSymbols][Math.floor(Math.random() * 6)] :
          standardSymbols[0];
        result[0] = winIcon;
        result[1] = winIcon;
        // Leave third as random for double
        cheatBoosted = true;
      }
    }

    let { win, winAmount, multiplier, winType, description } = calculateWin(result, betAmount);
    
    // Apply house advantage if enabled and player would win
    // This reduces win probability by 25% when the casino is losing too much money
    if (win && winAmount > 0 && houseAdvantageEnabled) {
      // 25% chance to convert a win into a loss
      if (Math.random() < 0.25) {
        win = false;
        winAmount = 0;
        multiplier = 0;
        winType = 'none';
        description = 'Better luck next time!';
        // Force a non-winning result by ensuring no matches
        result = [icons[0], icons[1], icons[2]]; // Different symbols
        console.log(`[Slots] 🏠 House advantage applied: win converted to loss`);
      }
    }

    // Log game end
    logger.logGameEnd('slots', Username, winType, winAmount, win, {
      result: result.join(''),
      multiplier: multiplier,
      bet_amount: betAmount,
      cheat_boosted: cheatBoosted
    });

    // Store game state in Redis
    const gameState = {
      lastSpin: new Date().toISOString(),
      lastResult: result,
      lastWin: win,
      lastWinAmount: winAmount,
      betAmount: betAmount,
      multiplier: multiplier,
      winType: winType,
      description: description,
      cheatActive: cheatActive,
      cheatType: cheatType,
      cheatBoosted: cheatBoosted
    };
    await saveGameState(Username, gameState);

    // Record game result in scoring service for ALL games (wins and losses) to track total bets
    recordGameResult({
      username: Username,
      game: 'slots',
      action: 'spin',
      betAmount: betAmount,
      payout: winAmount,
      win: win && winAmount > 0,
      result: win ? 'win' : 'lose',
      gameData: {
        result: result,
        multiplier: multiplier,
        winType: winType,
      },
      metadata: {
        cheatActive: cheatActive,
        cheatType: cheatType,
        cheatBoosted: cheatBoosted,
        timestamp: new Date().toISOString(),
      },
    }).catch(err => console.warn('Failed to record game result:', err));

    // Add result attributes to span
    span.setAttributes({
      'game.win': win,
      'game.win_amount': winAmount,
      'game.multiplier': multiplier,
      'game.win_type': winType,
    });
    span.end();

    callback(null, {
      result: result,
      win: win,
      win_amount: winAmount,
      bet_amount: betAmount,
      multiplier: multiplier,
      win_type: winType,
      description: description || (win ? `You won ${winAmount}!` : 'Better luck next time!'),
      timestamp: new Date().toISOString(),
      cheat_active: cheatActive,
      cheat_type: cheatType,
      cheat_boosted: cheatBoosted
    });
  }

  async GetGameAssets(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-slots-service');
    const span = tracer.startSpan('slots_get_game_assets', undefined, extractedContext);
    
    try {
      const { asset_type } = call.request;
      
      // Get feature flags for game configuration
    const enableProgressiveJackpot = await getFeatureFlag('slots.progressive-jackpot', true);
    const enableBonusRounds = await getFeatureFlag('slots.bonus-rounds', true);
    const enableCheatDetection = await getFeatureFlag('slots.cheat-detection', true);
    const minBet = Number(await getFeatureFlag('slots.min-bet', 10)) || 10;
    const maxBet = Number(await getFeatureFlag('slots.max-bet', 1000)) || 1000;
    
    const html = generateSlotsHTML();
    const js = generateSlotsJS(enableProgressiveJackpot, enableBonusRounds, enableCheatDetection);
    const css = generateSlotsCSS();
    
      const config = {
        service_endpoint: process.env.SERVICE_ENDPOINT || 'localhost:50051',
        game_name: 'Slots',
        game_type: 'slots-machine',
        min_bet: String(minBet),
        max_bet: String(maxBet),
        progressive_jackpot: enableProgressiveJackpot,
        bonus_rounds: enableBonusRounds,
        cheat_detection: enableCheatDetection
      };

      span.setAttributes({
        'game.asset_type': asset_type || 'all',
        'feature_flag.progressive_jackpot': enableProgressiveJackpot,
        'feature_flag.bonus_rounds': enableBonusRounds,
        'feature_flag.cheat_detection': enableCheatDetection,
        'feature_flag.min_bet': minBet,
        'feature_flag.max_bet': maxBet,
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

function generateSlotsHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Slots Game</title>
    <link rel="stylesheet" href="https://cdn.tailwindcss.com">
</head>
<body class="bg-gray-900 text-white p-4">
    <div id="slots-game-container" class="max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-4 text-center">🎰 Slots Machine</h1>
        <div id="slots-result" class="text-center mb-4">
            <div class="flex justify-center gap-4 mb-4">
                <div id="slot1" class="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-4xl">?</div>
                <div id="slot2" class="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-4xl">?</div>
                <div id="slot3" class="w-20 h-20 bg-gray-800 rounded-lg flex items-center justify-center text-4xl">?</div>
            </div>
        </div>
        <div class="mb-4">
            <label class="block mb-2">Bet Amount:</label>
            <input type="number" id="bet-amount" value="10" min="10" max="1000" class="w-full p-2 bg-gray-800 text-white rounded">
        </div>
        <button id="spin-btn" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg">
            Spin
        </button>
        <div id="result" class="mt-4 text-center"></div>
    </div>
    <script src="/slots-game.js"></script>
</body>
</html>`;
}

function generateSlotsJS(enableProgressiveJackpot = true, enableBonusRounds = true, enableCheatDetection = true) {
  return `
// Slots Game JavaScript
// Feature flags: progressiveJackpot=${enableProgressiveJackpot}, bonusRounds=${enableBonusRounds}, cheatDetection=${enableCheatDetection}
async function initSlotsGame() {
    console.log('Initializing slots game...');
    
    document.getElementById('spin-btn').addEventListener('click', async () => {
        const betAmount = parseFloat(document.getElementById('bet-amount').value);
        
        try {
            const response = await callSlotsService('Spin', {
                bet_amount: betAmount,
                cheat_active: ${enableCheatDetection ? 'false' : 'false'}
            });
            
            document.getElementById('slot1').textContent = response.result[0];
            document.getElementById('slot2').textContent = response.result[1];
            document.getElementById('slot3').textContent = response.result[2];
            
            if (response.win) {
                document.getElementById('result').innerHTML = 
                    \`<div class="text-green-500 text-xl">🎉 \${response.description} Win: $\${response.win_amount.toFixed(2)}</div>\`;
            } else {
                document.getElementById('result').innerHTML = 
                    \`<div class="text-red-500 text-xl">😢 \${response.description}</div>\`;
            }
        } catch (error) {
            console.error('Error spinning slots:', error);
            document.getElementById('result').innerHTML = 
                '<div class="text-red-500">Error: ' + error.message + '</div>';
        }
    });
}

async function callSlotsService(method, data) {
    const response = await fetch(\`/api/slots/\${method.toLowerCase()}\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await response.json();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSlotsGame);
} else {
    initSlotsGame();
}
`;
}

function generateSlotsCSS() {
  return `
#slots-game-container {
    font-family: 'Inter', sans-serif;
}

#slot1, #slot2, #slot3 {
    border: 2px solid #3B82F6;
    box-shadow: 0 0 20px rgba(59, 130, 246, 0.3);
    transition: transform 0.3s;
}

#slot1:hover, #slot2:hover, #slot3:hover {
    transform: scale(1.1);
}

#spin-btn {
    transition: all 0.3s;
}

#spin-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
}

#spin-btn:active {
    transform: translateY(0);
}
`;
}

// Start HTTP service
const slotsMetadata = {
  version: '2.1.0',
  gameType: 'slots-machine',
  complexity: 'high',
  rtp: '96.5%',
  owner: 'Gaming-Backend-Team',
  technology: 'Node.js-Express-Slots',
  maxPayout: '100x'
};

createService(process.env.SERVICE_NAME || 'vegas-slots-service', (app) => {
  app.post('/spin', (req, res) => {
    const tracer = trace.getTracer('vegas-slots-service');
    const span = tracer.startSpan('slots_spin');
    
    const p = req.body || {};
    const betAmount = p.BetAmount || 10;
    const cheatActive = p.CheatActive || false;
    const cheatType = p.CheatType || '';

    span.setAttributes({
      'game.action': 'spin',
      'game.bet_amount': betAmount,
      'game.cheat_active': cheatActive,
    });

    if (cheatType) {
      span.setAttribute('game.cheat_type', cheatType);
    }

    const symbols = ['🍒', '🍋', '🍊', '🔔', '⭐', '💎', '7️⃣'];
    let result = [
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)]
    ];

    let cheatBoosted = false;
    if (cheatActive && cheatType === 'symbolControl') {
      if (Math.random() < 0.3) {
        cheatBoosted = true;
        result = ['7️⃣', '7️⃣', '7️⃣'];
      }
    }

    const { win, winAmount, multiplier, winType } = calculateWin(result, betAmount);

    span.setAttributes({
      'game.win': win,
      'game.win_amount': winAmount,
      'game.multiplier': multiplier,
      'game.win_type': winType,
    });
    span.end();

    res.json({
      result,
      win,
      winAmount,
      betAmount,
      multiplier,
      winType,
      description: win ? `You won ${winAmount}!` : 'Better luck next time!',
      timestamp: new Date().toISOString(),
      cheatActive,
      cheatType,
      cheatBoosted
    });
  });
}, slotsMetadata);

// Start gRPC server
const GRPC_PORT = process.env.GRPC_PORT || 50051;
const server = new grpc.Server();

server.addService(slotsProto.SlotsService.service, new SlotsServiceImpl());
server.bindAsync(
  `0.0.0.0:${GRPC_PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (err, port) => {
    if (err) {
      console.error('Failed to start gRPC server:', err);
      return;
    }
    console.log(`🎰 Slots gRPC server listening on port ${port}`);
    server.start();
  }
);

