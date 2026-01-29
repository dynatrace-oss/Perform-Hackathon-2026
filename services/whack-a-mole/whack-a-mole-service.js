const { createService } = require('../common/service-runner');
const { trace } = require('@opentelemetry/api');

// Comprehensive Dynatrace Metadata for Whack-A-Mole Service
const whackAMoleMetadata = {
  version: '1.0.0',
  environment: 'vegas-casino-production',
  gameType: 'whack-a-mole',
  complexity: 'medium',
  rtp: '96.5%',
  owner: 'Arcade-Games-Team',
  technology: 'Node.js-Express-WhackAMole',
  features: ['time-based-gameplay', 'difficulty-levels', 'score-multipliers', 'session-state'],
  maxPayout: '1.5x',
  volatility: 'medium',
  gameDuration: '60-seconds',
  moleCount: 'progressive',
  specialFeatures: ['combo-detection', 'time-pressure', 'bonus-rounds']
};

// In-memory game state by Username
const games = new Map(); // key: Username, value: { score, moles, timeRemaining, hits, misses }

const GAME_DURATION = 60000; // 60 seconds
const INITIAL_MOLE_COUNT = 3;
const MAX_MOLES = 8;

function initializeGame() {
  return {
    score: 0,
    moles: INITIAL_MOLE_COUNT,
    timeRemaining: GAME_DURATION,
    hits: 0,
    misses: 0,
    startTime: Date.now(),
    combo: 0,
    maxCombo: 0
  };
}

function calculateScore(hits, misses, combo) {
  const baseScore = hits * 100;
  const comboBonus = Math.floor(combo * 10);
  const penalty = misses * 5;
  return Math.max(0, baseScore + comboBonus - penalty);
}

createService(process.env.SERVICE_NAME || 'vegas-whack-a-mole-service', (app) => {
  app.post('/start', (req, res) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const span = tracer.startSpan('whack_a_mole_start');
    
    const username = req.body.Username || 'anonymous';
    span.setAttributes({
      'game.action': 'start',
      'player.username': username,
    });

    const game = initializeGame();
    games.set(username, game);
    
    span.end();
    res.json({
      Status: 'started',
      Username: username,
      Score: game.score,
      Moles: game.moles,
      TimeRemaining: game.timeRemaining,
      GameId: `wam_${Date.now()}`
    });
  });

  app.post('/hit', (req, res) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const span = tracer.startSpan('whack_a_mole_hit');
    
    const username = req.body.Username || 'anonymous';
    const game = games.get(username);

    if (!game) {
      span.end();
      return res.status(404).json({ Error: 'Game not found' });
    }

    const timeElapsed = Date.now() - game.startTime;
    if (timeElapsed > GAME_DURATION) {
      span.end();
      return res.status(400).json({ 
        Error: 'Game over',
        FinalScore: game.score,
        Hits: game.hits,
        Misses: game.misses,
        MaxCombo: game.maxCombo
      });
    }

    // Simulate successful hit
    game.hits++;
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    game.score = calculateScore(game.hits, game.misses, game.combo);

    // Progressively increase mole count
    if (game.hits % 5 === 0 && game.moles < MAX_MOLES) {
      game.moles++;
    }

    span.setAttributes({
      'game.action': 'hit',
      'player.username': username,
      'game.score': game.score,
      'game.combo': game.combo,
      'game.hits': game.hits
    });

    span.end();
    res.json({
      Status: 'hit',
      Score: game.score,
      Hits: game.hits,
      Misses: game.misses,
      Combo: game.combo,
      Moles: game.moles,
      TimeRemaining: Math.max(0, GAME_DURATION - timeElapsed)
    });
  });

  app.post('/miss', (req, res) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const span = tracer.startSpan('whack_a_mole_miss');
    
    const username = req.body.Username || 'anonymous';
    const game = games.get(username);

    if (!game) {
      span.end();
      return res.status(404).json({ Error: 'Game not found' });
    }

    const timeElapsed = Date.now() - game.startTime;
    if (timeElapsed > GAME_DURATION) {
      span.end();
      return res.status(400).json({ 
        Error: 'Game over',
        FinalScore: game.score,
        Hits: game.hits,
        Misses: game.misses,
        MaxCombo: game.maxCombo
      });
    }

    game.misses++;
    game.combo = 0; // Reset combo on miss
    game.score = calculateScore(game.hits, game.misses, game.combo);

    span.setAttributes({
      'game.action': 'miss',
      'player.username': username,
      'game.score': game.score,
      'game.misses': game.misses
    });

    span.end();
    res.json({
      Status: 'miss',
      Score: game.score,
      Hits: game.hits,
      Misses: game.misses,
      Combo: game.combo,
      TimeRemaining: Math.max(0, GAME_DURATION - timeElapsed)
    });
  });

  app.post('/end', (req, res) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const span = tracer.startSpan('whack_a_mole_end');
    
    const username = req.body.Username || 'anonymous';
    const game = games.get(username);

    if (!game) {
      span.end();
      return res.status(404).json({ Error: 'Game not found' });
    }

    const finalScore = game.score;
    const hits = game.hits;
    const misses = game.misses;
    const maxCombo = game.maxCombo;

    games.delete(username);

    span.setAttributes({
      'game.action': 'end',
      'player.username': username,
      'game.final_score': finalScore,
      'game.hits': hits,
      'game.misses': misses,
      'game.max_combo': maxCombo
    });

    span.end();
    res.json({
      Status: 'ended',
      FinalScore: finalScore,
      Hits: hits,
      Misses: misses,
      MaxCombo: maxCombo,
      Accuracy: hits > 0 ? (hits / (hits + misses) * 100).toFixed(2) + '%' : '0%'
    });
  });

  app.get('/status/:username', (req, res) => {
    const username = req.params.username;
    const game = games.get(username);

    if (!game) {
      return res.status(404).json({ Error: 'Game not found' });
    }

    const timeElapsed = Date.now() - game.startTime;
    const gameActive = timeElapsed < GAME_DURATION;

    res.json({
      Username: username,
      Active: gameActive,
      Score: game.score,
      Hits: game.hits,
      Misses: game.misses,
      Combo: game.combo,
      Moles: game.moles,
      TimeRemaining: Math.max(0, GAME_DURATION - timeElapsed)
    });
  });

  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'vegas-whack-a-mole-service',
      version: whackAMoleMetadata.version,
      uptime: process.uptime()
    });
  });
});
