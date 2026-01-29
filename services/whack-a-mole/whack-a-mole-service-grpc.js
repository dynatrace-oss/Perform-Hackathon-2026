/**
 * Whack-A-Mole Service with gRPC Support
 * Provides both HTTP and gRPC endpoints
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { createService } = require('../common/service-runner');
const { trace, context, propagation } = require('@opentelemetry/api');
const { getFeatureFlag } = require('../common/openfeature');
const { initializeRedis, set, get, del } = require('../common/redis');
const { recordGameResult, recordScore } = require('../common/scoring');
const Logger = require('../common/logger');

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
const logger = new Logger('vegas-whack-a-mole-service');

// Load proto file
const PROTO_PATH = path.join(__dirname, '../proto/whack-a-mole.proto');

// Package and service definitions
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});
const proto = grpc.loadPackageDefinition(packageDefinition);

// In-memory game state
const games = new Map();
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

// gRPC service implementation
const whackAMoleService = {
  StartGame: async (call, callback) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const carrier = extractMetadata(call.metadata);
    const ctx = propagation.extract(context.active(), carrier);

    await context.with(ctx, () => {
      const span = tracer.startSpan('grpc_start_game');
      
      try {
        const username = call.request.username || 'anonymous';
        const game = initializeGame();
        games.set(username, game);

        span.setAttributes({
          'grpc.method': 'StartGame',
          'player.username': username
        });

        logger.info(`Game started for ${username}`);

        callback(null, {
          status: 'started',
          username: username,
          score: game.score,
          moles: game.moles,
          timeRemaining: game.timeRemaining,
          gameId: `wam_${Date.now()}`
        });

        span.end();
      } catch (error) {
        logger.error(`Error in StartGame: ${error.message}`);
        span.recordException(error);
        span.end();
        callback({
          code: grpc.status.INTERNAL,
          message: error.message
        });
      }
    });
  },

  Hit: async (call, callback) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const carrier = extractMetadata(call.metadata);
    const ctx = propagation.extract(context.active(), carrier);

    await context.with(ctx, () => {
      const span = tracer.startSpan('grpc_hit');
      
      try {
        const username = call.request.username || 'anonymous';
        const game = games.get(username);

        if (!game) {
          span.end();
          return callback({
            code: grpc.status.NOT_FOUND,
            message: 'Game not found'
          });
        }

        const timeElapsed = Date.now() - game.startTime;
        if (timeElapsed > GAME_DURATION) {
          span.end();
          return callback(null, {
            status: 'game_over',
            finalScore: game.score,
            hits: game.hits,
            misses: game.misses,
            maxCombo: game.maxCombo
          });
        }

        game.hits++;
        game.combo++;
        game.maxCombo = Math.max(game.maxCombo, game.combo);
        game.score = calculateScore(game.hits, game.misses, game.combo);

        if (game.hits % 5 === 0 && game.moles < MAX_MOLES) {
          game.moles++;
        }

        span.setAttributes({
          'grpc.method': 'Hit',
          'player.username': username,
          'game.score': game.score,
          'game.combo': game.combo
        });

        callback(null, {
          status: 'hit',
          score: game.score,
          hits: game.hits,
          misses: game.misses,
          combo: game.combo,
          moles: game.moles,
          timeRemaining: Math.max(0, GAME_DURATION - timeElapsed)
        });

        span.end();
      } catch (error) {
        logger.error(`Error in Hit: ${error.message}`);
        span.recordException(error);
        span.end();
        callback({
          code: grpc.status.INTERNAL,
          message: error.message
        });
      }
    });
  },

  Miss: async (call, callback) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const carrier = extractMetadata(call.metadata);
    const ctx = propagation.extract(context.active(), carrier);

    await context.with(ctx, () => {
      const span = tracer.startSpan('grpc_miss');
      
      try {
        const username = call.request.username || 'anonymous';
        const game = games.get(username);

        if (!game) {
          span.end();
          return callback({
            code: grpc.status.NOT_FOUND,
            message: 'Game not found'
          });
        }

        const timeElapsed = Date.now() - game.startTime;
        if (timeElapsed > GAME_DURATION) {
          span.end();
          return callback(null, {
            status: 'game_over',
            finalScore: game.score,
            hits: game.hits,
            misses: game.misses,
            maxCombo: game.maxCombo
          });
        }

        game.misses++;
        game.combo = 0;
        game.score = calculateScore(game.hits, game.misses, game.combo);

        span.setAttributes({
          'grpc.method': 'Miss',
          'player.username': username,
          'game.score': game.score,
          'game.misses': game.misses
        });

        callback(null, {
          status: 'miss',
          score: game.score,
          hits: game.hits,
          misses: game.misses,
          combo: game.combo,
          timeRemaining: Math.max(0, GAME_DURATION - timeElapsed)
        });

        span.end();
      } catch (error) {
        logger.error(`Error in Miss: ${error.message}`);
        span.recordException(error);
        span.end();
        callback({
          code: grpc.status.INTERNAL,
          message: error.message
        });
      }
    });
  },

  EndGame: async (call, callback) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const carrier = extractMetadata(call.metadata);
    const ctx = propagation.extract(context.active(), carrier);

    await context.with(ctx, () => {
      const span = tracer.startSpan('grpc_end_game');
      
      try {
        const username = call.request.username || 'anonymous';
        const game = games.get(username);

        if (!game) {
          span.end();
          return callback({
            code: grpc.status.NOT_FOUND,
            message: 'Game not found'
          });
        }

        const finalScore = game.score;
        const hits = game.hits;
        const misses = game.misses;
        const maxCombo = game.maxCombo;
        const accuracy = hits > 0 ? (hits / (hits + misses) * 100).toFixed(2) : 0;

        games.delete(username);

        span.setAttributes({
          'grpc.method': 'EndGame',
          'player.username': username,
          'game.final_score': finalScore,
          'game.accuracy': accuracy
        });

        logger.info(`Game ended for ${username} with score ${finalScore}`);

        callback(null, {
          status: 'ended',
          finalScore: finalScore,
          hits: hits,
          misses: misses,
          maxCombo: maxCombo,
          accuracy: accuracy
        });

        span.end();
      } catch (error) {
        logger.error(`Error in EndGame: ${error.message}`);
        span.recordException(error);
        span.end();
        callback({
          code: grpc.status.INTERNAL,
          message: error.message
        });
      }
    });
  },

  GetStatus: async (call, callback) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const span = tracer.startSpan('grpc_get_status');
    
    try {
      const username = call.request.username || 'anonymous';
      const game = games.get(username);

      if (!game) {
        span.end();
        return callback({
          code: grpc.status.NOT_FOUND,
          message: 'Game not found'
        });
      }

      const timeElapsed = Date.now() - game.startTime;
      const gameActive = timeElapsed < GAME_DURATION;

      span.setAttributes({
        'grpc.method': 'GetStatus',
        'player.username': username,
        'game.active': gameActive
      });

      callback(null, {
        username: username,
        active: gameActive,
        score: game.score,
        hits: game.hits,
        misses: game.misses,
        combo: game.combo,
        moles: game.moles,
        timeRemaining: Math.max(0, GAME_DURATION - timeElapsed)
      });

      span.end();
    } catch (error) {
      logger.error(`Error in GetStatus: ${error.message}`);
      span.recordException(error);
      span.end();
      callback({
        code: grpc.status.INTERNAL,
        message: error.message
      });
    }
  }
};

// Create the gRPC server and HTTP server
createService(process.env.SERVICE_NAME || 'vegas-whack-a-mole-service', (app) => {
  // gRPC server setup
  const server = new grpc.Server();
  
  try {
    server.addService(proto.WhackAMoleService.service, whackAMoleService);
    
    const GRPC_PORT = process.env.GRPC_PORT || 50051;
    server.bindAsync(`0.0.0.0:${GRPC_PORT}`, grpc.ServerCredentials.createInsecure(), () => {
      logger.info(`gRPC Server listening on port ${GRPC_PORT}`);
    });
  } catch (error) {
    logger.error(`Failed to setup gRPC server: ${error.message}`);
  }

  // Include HTTP endpoints from whack-a-mole-service.js
  const { trace } = require('@opentelemetry/api');

  const games_http = new Map();

  app.post('/start', (req, res) => {
    const tracer = trace.getTracer('vegas-whack-a-mole-service');
    const span = tracer.startSpan('http_start');
    
    const username = req.body.Username || 'anonymous';
    const game = {
      score: 0,
      moles: INITIAL_MOLE_COUNT,
      timeRemaining: GAME_DURATION,
      hits: 0,
      misses: 0,
      startTime: Date.now(),
      combo: 0,
      maxCombo: 0
    };
    games_http.set(username, game);
    
    span.setAttributes({
      'http.method': 'POST',
      'http.target': '/start',
      'player.username': username
    });
    
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
    const span = tracer.startSpan('http_hit');
    
    const username = req.body.Username || 'anonymous';
    const game = games_http.get(username);

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

    game.hits++;
    game.combo++;
    game.maxCombo = Math.max(game.maxCombo, game.combo);
    game.score = calculateScore(game.hits, game.misses, game.combo);

    if (game.hits % 5 === 0 && game.moles < MAX_MOLES) {
      game.moles++;
    }

    span.setAttributes({
      'http.method': 'POST',
      'http.target': '/hit',
      'player.username': username,
      'game.score': game.score
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
    const span = tracer.startSpan('http_miss');
    
    const username = req.body.Username || 'anonymous';
    const game = games_http.get(username);

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
    game.combo = 0;
    game.score = calculateScore(game.hits, game.misses, game.combo);

    span.setAttributes({
      'http.method': 'POST',
      'http.target': '/miss',
      'player.username': username
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
    const span = tracer.startSpan('http_end');
    
    const username = req.body.Username || 'anonymous';
    const game = games_http.get(username);

    if (!game) {
      span.end();
      return res.status(404).json({ Error: 'Game not found' });
    }

    const finalScore = game.score;
    const hits = game.hits;
    const misses = game.misses;
    const maxCombo = game.maxCombo;

    games_http.delete(username);

    span.setAttributes({
      'http.method': 'POST',
      'http.target': '/end',
      'player.username': username,
      'game.final_score': finalScore
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
    const game = games_http.get(username);

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
      version: '1.0.0',
      uptime: process.uptime()
    });
  });
});
