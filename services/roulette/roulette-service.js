const { createService } = require('../common/service-runner');
const { trace } = require('@opentelemetry/api');
const { initializeTelemetry } = require('../common/opentelemetry');
const { getFeatureFlag } = require('../common/openfeature');
const { initializeRedis, set } = require('../common/redis');
const { recordGameResult } = require('../common/scoring');

// Initialize Redis
initializeRedis();

// Initialize OpenTelemetry first
initializeTelemetry('vegas-roulette-service', {
  version: '2.1.0',
  gameType: 'european-roulette',
  gameCategory: 'table-games',
  complexity: 'high',
  rtp: '97.3%',
  owner: 'Table-Games-Team',
  technology: 'Node.js-Express-Roulette',
  maxPayout: '36x'
});

// Comprehensive Dynatrace Metadata for Roulette Service
const rouletteMetadata = {
  version: '2.1.0',
  environment: 'vegas-casino-production',
  gameType: 'european-roulette',
  complexity: 'high',
  rtp: '97.3%',
  owner: 'Table-Games-Team',
  technology: 'Node.js-Express-Roulette',
  features: ['multiple-bet-types', 'live-wheel', 'cheat-detection', 'advanced-statistics'],
  maxPayout: '36x',
  volatility: 'medium',
  wheelType: '37-number-european',
  betTypes: ['straight', 'split', 'street', 'corner', 'red-black', 'odd-even'],
  specialFeatures: ['pattern-detection', 'hot-cold-numbers', 'betting-strategies']
};

createService(process.env.SERVICE_NAME || 'vegas-roulette-service', (app) => {
  // HTTP endpoint for game assets (fallback when gRPC is not available)
  app.get('/api/game-assets', async (req, res) => {
    const tracer = trace.getTracer('vegas-roulette-service');
    const span = tracer.startSpan('roulette_get_game_assets');
    
    try {
      // Get feature flags for game configuration
      const multipleBetsEnabled = await getFeatureFlag('roulette.multiple-bets', true);
      const liveWheelEnabled = await getFeatureFlag('roulette.live-wheel', true);
      const cheatsEnabled = await getFeatureFlag('roulette.cheat-detection', true);
      
      // Return empty assets - roulette uses static HTML from frontend
      // This endpoint exists for compatibility with the frontend's getGameAssets call
      const response = {
        html: '',
        javascript: '',
        css: '',
        config: {
          service_endpoint: process.env.SERVICE_ENDPOINT || 'localhost:50052',
          game_name: 'Roulette',
          game_type: 'european-roulette',
          min_bet: '10',
          max_bet: '1000',
          multiple_bets_enabled: multipleBetsEnabled,
          live_wheel_enabled: liveWheelEnabled,
          cheats_enabled: cheatsEnabled
        }
      };
      
      span.setAttributes({
        'game.feature_flag.multiple_bets': multipleBetsEnabled,
        'game.feature_flag.live_wheel': liveWheelEnabled,
      });
      span.end();
      
      res.json(response);
    } catch (error) {
      span.setAttribute('http.status_code', 500);
      span.recordException(error);
      span.end();
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/spin', async (req, res) => {
    const tracer = trace.getTracer('vegas-roulette-service');
    const span = tracer.startSpan('roulette_spin');
    
    const p = req.body || {};
    
    // Get feature flags
    const multipleBetsEnabled = await getFeatureFlag('roulette.multiple-bets', true);
    const liveWheelEnabled = await getFeatureFlag('roulette.live-wheel', true);
    const cheatsEnabled = await getFeatureFlag('roulette.cheat-detection', true);
    
    // Check if cheating is active (only if feature flag is enabled)
    const cheatActive = cheatsEnabled && p.CheatActive === true;
    const cheatType = cheatActive ? (p.CheatType || 'ballControl') : null;
    
      span.setAttributes({
        'game.action': 'spin',
        'game.cheat_active': cheatActive,
        'feature_flag.multiple_bets': multipleBetsEnabled,
        'feature_flag.live_wheel': liveWheelEnabled,
        'feature_flag.cheat_detection': cheatsEnabled,
      });
    
    if (cheatType) {
      span.setAttribute('game.cheat_type', cheatType);
    }
    
    // Validate multiple bets feature flag
    if (p.BetType === 'multiple' && !multipleBetsEnabled) {
      span.setAttribute('http.status_code', 403);
      span.setAttribute('feature_flag.blocked', true);
      span.end();
      return res.status(403).json({ error: 'Multiple bets feature is disabled' });
    }
    
    let winningNumber = Math.floor(Math.random()*37);
    let cheatBoosted = false;
    
    // Apply cheat logic to influence outcomes
    if (cheatActive && p.BetType === 'multiple' && p.BetValue && typeof p.BetValue === 'object') {
      // Analyze the bets to potentially boost favorable outcomes
      const playerBets = Object.entries(p.BetValue);
      
      // Apply cheat probability boost based on cheat type
      const boostChance = getCheatBoostChance(cheatType);
      
      if (Math.random() < boostChance) {
        cheatBoosted = true;
        
        // Try to find a winning number for the player's bets
        const potentialWinningNumbers = [];
        
        for (let testNumber = 0; testNumber <= 36; testNumber++) {
          const testRed = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
          const testColor = testNumber === 0 ? 'green' : (testRed.includes(testNumber) ? 'red' : 'black');
          
          for (const [, bet] of playerBets) {
            if (!bet || typeof bet !== 'object') continue;
            
            let wouldWin = false;
            if (bet.type === 'straight' && testNumber === Number(bet.value)) wouldWin = true;
            else if (bet.type === 'red' && testColor === 'red') wouldWin = true;
            else if (bet.type === 'black' && testColor === 'black') wouldWin = true;
            else if (bet.type === 'even' && testNumber > 0 && testNumber % 2 === 0) wouldWin = true;
            else if (bet.type === 'odd' && testNumber > 0 && testNumber % 2 === 1) wouldWin = true;
            else if (bet.type === 'low' && testNumber >= 1 && testNumber <= 18) wouldWin = true;
            else if (bet.type === 'high' && testNumber >= 19 && testNumber <= 36) wouldWin = true;
            
            if (wouldWin) {
              potentialWinningNumbers.push(testNumber);
              break; // Found a winning number for this bet
            }
          }
        }
        
        // Use a favorable number if available
        if (potentialWinningNumbers.length > 0) {
          winningNumber = potentialWinningNumbers[Math.floor(Math.random() * potentialWinningNumbers.length)];
        }
      }
    }
    
    const red = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    const color = winningNumber===0 ? 'green' : (red.includes(winningNumber)?'red':'black');
    let payout = 0;
    let anyWin = false;
    // Support multiple bets structure from UI: BetType: 'multiple', BetValue: { key: { type, value, amount } }
    if (p.BetType === 'multiple' && p.BetValue && typeof p.BetValue === 'object') {
      for (const [, bet] of Object.entries(p.BetValue)) {
        if (!bet || typeof bet !== 'object') continue;
        const amount = Number(bet.amount || 0);
        const type = bet.type;
        const val = bet.value;
        let win = false;
        let multi = 0;
        if (type === 'straight') {
          win = (winningNumber === Number(val));
          multi = 35;
        } else if (type === 'red') {
          win = (color === 'red');
          multi = 1;
        } else if (type === 'black') {
          win = (color === 'black');
          multi = 1;
        } else if (type === 'even') {
          win = (winningNumber > 0 && winningNumber % 2 === 0);
          multi = 1;
        } else if (type === 'odd') {
          win = (winningNumber > 0 && winningNumber % 2 === 1);
          multi = 1;
        } else if (type === 'low') { // 1-18
          win = (winningNumber >= 1 && winningNumber <= 18);
          multi = 1;
        } else if (type === 'high') { // 19-36
          win = (winningNumber >= 19 && winningNumber <= 36);
          multi = 1;
        }
        if (win && amount > 0) {
          payout += amount * (multi + 1); // return stake + winnings (align with UI calc)
          anyWin = true;
        }
      }
    } else {
      // Fallback simple color bet
      const betAmount = Number(p.BetAmount || 10);
      const isWin = color === (p.BetType||'red');
      payout = isWin ? betAmount * 2 : 0; // include stake back
      anyWin = isWin;
    }
    // Calculate total bet amount
    let totalBetAmount = 0;
    if (p.BetType === 'multiple' && p.BetValue && typeof p.BetValue === 'object') {
      for (const [, bet] of Object.entries(p.BetValue)) {
        if (bet && typeof bet === 'object') {
          totalBetAmount += Number(bet.amount || 0);
        }
      }
    } else {
      totalBetAmount = Number(p.BetAmount || 10);
    }

    const Username = p.Username || 'Anonymous';

    // Store game state in Redis
    const gameStateKey = `roulette:${Username}:last_spin`;
    await set(gameStateKey, JSON.stringify({
      winningNumber,
      color,
      payout,
      win: anyWin,
      timestamp: new Date().toISOString(),
    }), 3600); // Expire after 1 hour

    // Record game result in scoring service (async, don't block response)
    recordGameResult({
      username: Username,
      game: 'roulette',
      action: 'spin',
      betAmount: totalBetAmount,
      payout: payout,
      win: anyWin,
      result: anyWin ? 'win' : 'lose',
      gameData: {
        winningNumber,
        color,
        betType: p.BetType,
      },
      metadata: {
        cheatActive: cheatActive,
        cheatType: cheatType,
        cheatBoosted: cheatBoosted,
        timestamp: new Date().toISOString(),
      },
    }).catch(err => console.warn('Failed to record game result:', err));

    // Add game attributes to span
    span.setAttributes({
      'game.winning_number': winningNumber,
      'game.color': color,
      'game.win': anyWin,
      'game.payout': payout,
      'game.cheat_boosted': cheatBoosted,
    });
    span.end();
    
    res.json({ 
      winningNumber, 
      color, 
      win: anyWin, 
      payout, 
      timestamp: new Date().toISOString(),
      // Add cheat metadata to response
      cheatActive: cheatActive,
      cheatType: cheatType,
      cheatBoosted: cheatBoosted
    });
  });

  // Helper function to determine cheat boost chance based on cheat type
  function getCheatBoostChance(cheatType) {
    const cheatBoostChances = {
      ballControl: 0.30,     // 30% chance to influence outcome
      wheelBias: 0.25,       // 25% chance 
      magneticField: 0.40,   // 40% chance (highest risk, highest reward)
      sectorPrediction: 0.35 // 35% chance
    };
    
    return cheatBoostChances[cheatType] || 0;
  }
}, rouletteMetadata);