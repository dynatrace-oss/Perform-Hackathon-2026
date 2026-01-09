/**
 * Scoring service API helper for game services
 */

const { trace, context, propagation } = require('@opentelemetry/api');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const Logger = require('./logger');

const SCORING_SERVICE_URL = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';

// Initialize logger - use service name from env or default
const SERVICE_NAME = process.env.SERVICE_NAME || process.env.OTEL_SERVICE_NAME || 'vegas-service';
const logger = new Logger(SERVICE_NAME);

/**
 * Make HTTP request with trace context propagation
 */
function makeHttpRequest(url, options, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    // Get current trace context and inject into headers
    const activeContext = context.active();
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    };
    propagation.inject(activeContext, headers, {
      set: (carrier, key, value) => {
        carrier[key] = value;
      }
    });
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'POST',
      headers: headers,
    };
    
    const req = httpModule.request(requestOptions, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = responseData ? JSON.parse(responseData) : null;
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, data: responseData });
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${responseData.substring(0, 200)}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(data);
    req.end();
  });
}

/**
 * Record a game result in the scoring service
 */
async function recordGameResult(gameResult) {
  try {
    const payload = {
      username: gameResult.username,
      game: gameResult.game,
      action: gameResult.action,
      betAmount: gameResult.betAmount,
      payout: gameResult.payout,
      win: gameResult.win,
      result: gameResult.result || (gameResult.win ? 'win' : 'lose'),
      gameData: gameResult.gameData ? JSON.stringify(gameResult.gameData) : null,
      metadata: gameResult.metadata ? JSON.stringify(gameResult.metadata) : null,
    };

    const url = `${SCORING_SERVICE_URL}/api/scoring/game-result`;
    const payloadStr = JSON.stringify(payload);
    
    // Log before calling scoring API
    logger.logInfo('Preparing to save game result to scoring API', {
      operation: 'record_game_result',
      username: gameResult.username,
      game: gameResult.game,
      action: gameResult.action,
      bet_amount: gameResult.betAmount,
      payout: gameResult.payout,
      win: gameResult.win,
      scoring_service_url: url
    });
    
    console.log(`[Scoring] Recording game result: ${gameResult.game}/${gameResult.action} for ${gameResult.username} to ${url}`);
    console.log(`[Scoring] Payload:`, payloadStr.substring(0, 200));

    try {
      const startTime = Date.now();
      const response = await makeHttpRequest(url, { method: 'POST' }, payloadStr);
      const duration = Date.now() - startTime;
      
      // Log successful save
      logger.logInfo('Successfully saved game result to scoring API', {
        operation: 'record_game_result',
        username: gameResult.username,
        game: gameResult.game,
        action: gameResult.action,
        result_id: response.data?.id || 'N/A',
        duration_ms: duration,
        status_code: response.status
      });
      
      console.log(`[Scoring] Successfully recorded game result for ${gameResult.username}`, 
        response.data ? `ID: ${response.data.id || 'N/A'}` : '');
      return true;
    } catch (error) {
      // Log error
      logger.logError(error, {
        operation: 'record_game_result',
        username: gameResult.username,
        game: gameResult.game,
        action: gameResult.action,
        scoring_service_url: url
      });
      
      console.error(`[Scoring] Failed to record game result:`, error.message);
      console.error(`[Scoring] Request URL: ${url}`);
      console.error(`[Scoring] SCORING_SERVICE_URL: ${SCORING_SERVICE_URL}`);
      console.error(`[Scoring] Error stack:`, error.stack);
      return false;
    }
  } catch (error) {
    logger.logError(error, {
      operation: 'prepare_game_result_request',
      username: gameResult.username,
      game: gameResult.game
    });
    console.error(`[Scoring] Error preparing game result request: ${error.message}`, error);
    return false;
  }
}

/**
 * Record a player score for leaderboards
 */
async function recordScore(scoreData) {
  try {
    const payload = {
      username: scoreData.username,
      role: scoreData.role || 'player',
      game: scoreData.game,
      score: scoreData.score,
      metadata: scoreData.metadata ? JSON.stringify(scoreData.metadata) : null,
    };

    const url = `${SCORING_SERVICE_URL}/api/scoring/record`;
    const payloadStr = JSON.stringify(payload);
    
    // Log before calling scoring API
    logger.logInfo('Preparing to save score to scoring API', {
      operation: 'record_score',
      username: scoreData.username,
      game: scoreData.game,
      score: scoreData.score,
      role: scoreData.role || 'player',
      scoring_service_url: url
    });
    
    console.log(`[Scoring] Recording score: ${scoreData.game} score ${scoreData.score} for ${scoreData.username} to ${url}`);

    try {
      const startTime = Date.now();
      const response = await makeHttpRequest(url, { method: 'POST' }, payloadStr);
      const duration = Date.now() - startTime;
      
      // Log successful save
      logger.logInfo('Successfully saved score to scoring API', {
        operation: 'record_score',
        username: scoreData.username,
        game: scoreData.game,
        score: scoreData.score,
        duration_ms: duration,
        status_code: response.status
      });
      
      console.log(`[Scoring] Successfully recorded score for ${scoreData.username}`);
      return true;
    } catch (error) {
      // Log error
      logger.logError(error, {
        operation: 'record_score',
        username: scoreData.username,
        game: scoreData.game,
        score: scoreData.score,
        scoring_service_url: url
      });
      
      console.error(`[Scoring] Failed to record score:`, error.message);
      console.error(`[Scoring] Request URL: ${url}`);
      return false;
    }
  } catch (error) {
    logger.logError(error, {
      operation: 'prepare_score_request',
      username: scoreData.username,
      game: scoreData.game
    });
    console.error(`[Scoring] Error preparing score request: ${error.message}`, error);
    return false;
  }
}

module.exports = {
  recordGameResult,
  recordScore,
  SCORING_SERVICE_URL,
};

