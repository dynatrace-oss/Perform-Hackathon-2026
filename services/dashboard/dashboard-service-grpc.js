/**
 * Dashboard Service with gRPC Support
 * Provides analytics and visualization dashboard for game statistics
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { trace, context, propagation } = require('@opentelemetry/api');
const { initializeTelemetry } = require('./common/opentelemetry');
const Logger = require('./common/logger');

// Initialize OpenTelemetry
initializeTelemetry('vegas-dashboard-service', {
  version: '2.1.0',
  gameType: 'dashboard',
  gameCategory: 'analytics',
  complexity: 'medium',
  rtp: 'N/A',
  owner: 'Analytics-Team',
  technology: 'Node.js-Express-Dashboard-gRPC',
  maxPayout: 'N/A'
});

// Initialize Logger
const logger = new Logger('vegas-dashboard-service');

// Load proto file
const PROTO_PATH = path.join(__dirname, 'proto/dashboard.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const dashboardProto = grpc.loadPackageDefinition(packageDefinition).dashboard;

// Scoring service URL
const SCORING_SERVICE_URL = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';

// Helper function to extract metadata for trace context
function extractMetadata(metadata) {
  const carrier = {};
  try {
    if (metadata && metadata.getMap) {
      const metadataMap = metadata.getMap();
      if (metadataMap instanceof Map) {
        for (const [key, value] of metadataMap.entries()) {
          carrier[key.toLowerCase()] = Array.isArray(value) ? value[0] : String(value);
        }
      } else if (typeof metadataMap === 'object') {
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

// Helper to fetch from scoring service with trace context
// Tries both endpoint formats if the first one fails
async function fetchFromScoringService(url, span, retryWithAlternative = true) {
  const http = require('http');
  const https = require('https');
  const { URL } = require('url');
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    // Get current trace context and inject into headers
    const activeContext = context.active();
    const headers = {};
    propagation.inject(activeContext, headers);
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
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
            if (!responseData || responseData.trim() === '') {
              console.log(`[Dashboard] Empty response from scoring service for ${url}`);
              resolve([]);
              return;
            }
            const parsed = JSON.parse(responseData);
            console.log(`[Dashboard] ✅ Successfully fetched from ${url}, response type:`, typeof parsed, Array.isArray(parsed) ? 'array' : 'object', parsed ? Object.keys(parsed) : 'null');
            resolve(parsed);
          } catch (e) {
            console.error(`[Dashboard] Failed to parse response:`, e.message, 'Response data:', responseData.substring(0, 500));
            reject(new Error(`Failed to parse response: ${e.message}`));
          }
        } else if (res.statusCode === 404 && retryWithAlternative) {
          // If 404, try alternative endpoint format
          const alternativeUrl = url.replace('/api/game-results/', '/api/scoring/game-results/')
                                   .replace('/api/scoring/game-results/', '/api/game-results/');
          console.log(`[Dashboard] ⚠️ Endpoint ${url} returned 404, trying alternative: ${alternativeUrl}`);
          fetchFromScoringService(alternativeUrl, span, false)
            .then(resolve)
            .catch(reject);
        } else {
          span.setAttribute('http.status_code', res.statusCode);
          const errorMsg = `Scoring service returned ${res.statusCode}: ${responseData ? responseData.substring(0, 200) : 'no response data'}`;
          console.error(`[Dashboard] ${errorMsg}`);
          span.recordException(new Error(errorMsg));
          reject(new Error(errorMsg));
        }
      });
    });
    
    req.on('error', (error) => {
      if (retryWithAlternative && (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
        // Try alternative endpoint format on connection error
        const alternativeUrl = url.replace('/api/game-results/', '/api/scoring/game-results/')
                                 .replace('/api/scoring/game-results/', '/api/game-results/');
        console.log(`[Dashboard] ⚠️ Connection error for ${url}, trying alternative: ${alternativeUrl}`);
        fetchFromScoringService(alternativeUrl, span, false)
          .then(resolve)
          .catch(reject);
      } else {
        reject(error);
      }
    });
    
    req.end();
  });
}

// gRPC Service Implementation
class DashboardServiceImpl {
  async Health(call, callback) {
    const serviceName = process.env.SERVICE_NAME || 'vegas-dashboard-service';
    callback(null, {
      status: 'ok',
      service: serviceName,
      metadata: {
        version: '2.1.0',
        gameType: 'dashboard',
        gameCategory: 'analytics',
        complexity: 'medium',
        owner: 'Analytics-Team',
        technology: 'Node.js-Express-Dashboard-gRPC'
      }
    });
  }

  async GetDashboardStats(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-dashboard-service');
    const span = tracer.startSpan('dashboard.get_stats', undefined, extractedContext);
    
    try {
      const { game } = call.request;
      
      span.setAttributes({
        'dashboard.game': game,
        'dashboard.operation': 'get_dashboard_stats',
      });
      
      // Use the dashboard endpoint which returns aggregated stats with topPlayers
      // This is more efficient than fetching all individual game results
      let dashboardUrl = `${SCORING_SERVICE_URL}/api/scoring/dashboard/${game}`;
      console.log(`[Dashboard] Fetching dashboard stats from: ${dashboardUrl}`);
      
      let dashboardStats;
      try {
        dashboardStats = await fetchFromScoringService(dashboardUrl, span);
        console.log(`[Dashboard] 🔍 Raw dashboard response:`, typeof dashboardStats, dashboardStats ? Object.keys(dashboardStats) : 'null/undefined');
        
        // Handle response format - could be direct object or wrapped
        if (dashboardStats && typeof dashboardStats === 'object') {
          // If wrapped in stats property, unwrap it
          if (dashboardStats.stats && typeof dashboardStats.stats === 'object') {
            dashboardStats = dashboardStats.stats;
          }
        } else {
          dashboardStats = {};
        }
        
        console.log(`[Dashboard] ✅ Retrieved dashboard stats for ${game}:`, {
          totalGames: dashboardStats.totalGames,
          totalWins: dashboardStats.totalWins,
          totalLosses: dashboardStats.totalLosses,
          topPlayersCount: dashboardStats.topPlayers ? dashboardStats.topPlayers.length : 0
        });
      } catch (error) {
        console.error(`[Dashboard] Error fetching dashboard stats from scoring service:`, error.message);
        span.recordException(error);
        dashboardStats = {};
      }
      
      // Extract stats from dashboard response
      const totalGames = dashboardStats.totalGames || 0;
      const totalWins = dashboardStats.totalWins || 0;
      const totalLosses = dashboardStats.totalLosses || 0;
      const totalBetAmount = dashboardStats.totalBetAmount || 0;
      const totalPayout = dashboardStats.totalPayout || 0;
      const topPlayers = dashboardStats.topPlayers || dashboardStats.top_players || [];
      
      console.log(`[Dashboard] 📊 Extracted stats for ${game}: totalGames=${totalGames}, totalWins=${totalWins}, topPlayers=${topPlayers.length}`);
      
      // Log first top player structure for debugging
      if (topPlayers.length > 0) {
        console.log(`[Dashboard] 🔍 First topPlayer structure for ${game}:`, JSON.stringify(topPlayers[0], null, 2));
        console.log(`[Dashboard] 🔍 First topPlayer fields:`, {
          username: topPlayers[0].username,
          score: topPlayers[0].score,
          winnings: topPlayers[0].winnings,
          initialBet: topPlayers[0].initialBet,
          initial_bet: topPlayers[0].initial_bet,
          bet_amount: topPlayers[0].bet_amount,
          betAmount: topPlayers[0].betAmount,
          role: topPlayers[0].role,
          game: topPlayers[0].game
        });
      }
      
      // Extract top_win from topPlayers array (first player is the top winner)
      let topWinData = null;
      if (topPlayers.length > 0) {
        const topPlayer = topPlayers[0];
        const winnings = topPlayer.winnings || topPlayer.score || 0;
        let betAmount = topPlayer.initialBet || topPlayer.initial_bet || topPlayer.bet_amount || topPlayer.betAmount || 0;
        
        // If betAmount is still 0, try to get it from the player's recent game results
        if (betAmount === 0 && topPlayer.username) {
          console.log(`[Dashboard] ⚠️ Top player ${topPlayer.username} has betAmount=0, attempting to fetch from game results`);
          try {
            // Fetch recent game results for this player to get bet amount
            const resultsUrl = `${SCORING_SERVICE_URL}/api/scoring/game-results/${game}?limit=100`;
            const allResults = await fetchFromScoringService(resultsUrl, span);
            const results = Array.isArray(allResults) ? allResults : (allResults?.results || allResults?.data || []);
            
            // Find the winning game result for this player with the highest payout
            const playerWins = results.filter(r => 
              (r.username === topPlayer.username || r.userName === topPlayer.username) &&
              (parseFloat(r.payout || r.payoutAmount || r.winningAmount || 0) > 0)
            );
            
            if (playerWins.length > 0) {
              // Find the win with the highest payout (should match the top player's score)
              const topWin = playerWins.reduce((max, win) => {
                const payout = parseFloat(win.payout || win.payoutAmount || win.winningAmount || 0);
                const maxPayout = parseFloat(max.payout || max.payoutAmount || max.winningAmount || 0);
                return payout > maxPayout ? win : max;
              });
              
              betAmount = parseFloat(topWin.betAmount || topWin.bet_amount || 0);
              console.log(`[Dashboard] ✅ Found betAmount=${betAmount} from game results for ${topPlayer.username}`);
            }
          } catch (err) {
            console.warn(`[Dashboard] Failed to fetch bet amount from game results:`, err.message);
          }
        }
        
        if (winnings > 0) {
          topWinData = {
            username: topPlayer.username || 'Unknown',
            game: topPlayer.game || game,
            payout: -Math.abs(winnings), // Negative for casino perspective (casino loss)
            bet_amount: betAmount,
            timestamp: topPlayer.timestamp || new Date().toISOString()
          };
          console.log(`[Dashboard] ✅ Top win extracted from topPlayers for ${game}:`, JSON.stringify(topWinData));
        } else {
          console.log(`[Dashboard] ⚠️ Top player has winnings=${winnings}, not creating top_win`);
        }
      } else {
        console.log(`[Dashboard] ⚠️ No topPlayers found for ${game}`);
      }
      
      span.setAttributes({
        'dashboard.total_games': totalGames,
        'dashboard.total_wins': totalWins,
        'dashboard.total_losses': totalLosses,
        'dashboard.total_bet_amount': totalBetAmount,
        'dashboard.top_win_amount': topWinData ? Math.abs(topWinData.payout) : 0,
      });
      span.setStatus({ code: 1 });
      span.end();
      
      console.log(`[Dashboard] ✅ Returning stats for ${game}: total_games=${totalGames}, total_wins=${totalWins}, top_win=${topWinData ? JSON.stringify(topWinData) : 'null'}`);
      
      callback(null, {
        game: game,
        stats: {
          game: game,
          total_games: totalGames,
          total_wins: totalWins,
          total_losses: totalLosses,
          total_bet_amount: totalBetAmount,
          total_payout: totalPayout,
          top_win: topWinData,
          top_players: topPlayers.map((p, index) => ({
            username: p.username || 'Unknown',
            role: p.role || 'player',
            game: p.game || game,
            score: p.score || p.winnings || 0,
            rank: p.rank || (index + 1),
            initial_bet: p.initialBet || p.initial_bet || p.bet_amount || p.betAmount || 0,
            winnings: p.winnings || p.score || 0,
            metadata: p.metadata ? (typeof p.metadata === 'string' ? p.metadata : JSON.stringify(p.metadata)) : ''
          })),
          recent_games: [] // Not showing recent games
        }
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  }

  async GetAllDashboardStats(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-dashboard-service');
    const span = tracer.startSpan('dashboard.get_all_stats', undefined, extractedContext);
    
    try {
      span.setAttributes({
        'dashboard.operation': 'get_all_dashboard_stats',
      });
      
      // Use the dashboard endpoint which returns aggregated stats for all games
      const dashboardUrl = `${SCORING_SERVICE_URL}/api/scoring/dashboard`;
      console.log(`[Dashboard] Fetching all dashboard stats from: ${dashboardUrl}`);
      
      let allDashboardStats;
      try {
        allDashboardStats = await fetchFromScoringService(dashboardUrl, span);
        
        // Handle response format - could be array or object with stats array
        if (Array.isArray(allDashboardStats)) {
          // Direct array of stats
          allDashboardStats = allDashboardStats;
        } else if (allDashboardStats && typeof allDashboardStats === 'object') {
          // Check if wrapped in stats property
          if (Array.isArray(allDashboardStats.stats)) {
            allDashboardStats = allDashboardStats.stats;
          } else {
            // Single object, wrap in array
            allDashboardStats = [allDashboardStats];
          }
        } else {
          allDashboardStats = [];
        }
        
        console.log(`[Dashboard] ✅ Retrieved dashboard stats for ${allDashboardStats.length} games`);
      } catch (error) {
        console.error(`[Dashboard] Error fetching all dashboard stats:`, error.message);
        span.recordException(error);
        allDashboardStats = [];
      }
      
      // Process each game's stats and extract top_win from topPlayers
      const statsWithTopWins = allDashboardStats.map(gameStats => {
        const game = gameStats.game || 'unknown';
        const topPlayers = gameStats.topPlayers || gameStats.top_players || [];
        
        // Extract top_win from topPlayers array (first player is the top winner)
        let topWinData = null;
        if (topPlayers.length > 0) {
        const topPlayer = topPlayers[0];
        const winnings = topPlayer.winnings || topPlayer.score || 0;
        let betAmount = topPlayer.initialBet || topPlayer.initial_bet || topPlayer.bet_amount || topPlayer.betAmount || 0;
          
          if (winnings > 0) {
            topWinData = {
              username: topPlayer.username || 'Unknown',
              game: topPlayer.game || game,
              payout: -Math.abs(winnings), // Negative for casino perspective (casino loss)
              bet_amount: betAmount,
              timestamp: topPlayer.timestamp || new Date().toISOString()
            };
            console.log(`[Dashboard] ✅ Top win extracted for ${game}:`, JSON.stringify(topWinData));
          }
        }
        
        return {
          game: game,
          total_games: gameStats.totalGames || 0,
          total_wins: gameStats.totalWins || 0,
          total_losses: gameStats.totalLosses || 0,
          total_bet_amount: gameStats.totalBetAmount || 0,
          total_payout: gameStats.totalPayout || 0,
          top_win: topWinData,
          top_players: topPlayers.map((p, index) => ({
            username: p.username || 'Unknown',
            role: p.role || 'player',
            game: p.game || game,
            score: p.score || p.winnings || 0,
            rank: p.rank || (index + 1),
            initial_bet: p.initialBet || p.initial_bet || p.bet_amount || p.betAmount || 0,
            winnings: p.winnings || p.score || 0,
            metadata: p.metadata ? (typeof p.metadata === 'string' ? p.metadata : JSON.stringify(p.metadata)) : ''
          })),
          recent_games: []
        };
      });
      
      
      span.setAttributes({
        'dashboard.games_count': statsWithTopWins.length,
        'dashboard.total_wins': statsWithTopWins.reduce((sum, s) => sum + (s.total_wins || 0), 0),
      });
      span.setStatus({ code: 1 });
      span.end();
      
      callback(null, {
        stats: statsWithTopWins
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  }

  async GetLeaderboard(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-dashboard-service');
    const span = tracer.startSpan('dashboard.get_leaderboard', undefined, extractedContext);
    
    try {
      const { game, limit } = call.request;
      
      span.setAttributes({
        'dashboard.game': game,
        'dashboard.limit': limit || 10,
        'dashboard.operation': 'get_leaderboard',
      });
      
      const url = `${SCORING_SERVICE_URL}/api/scoring/leaderboard/${game}?limit=${limit || 10}`;
      const leaderboard = await fetchFromScoringService(url, span);
      
      span.setAttributes({
        'dashboard.record_count': Array.isArray(leaderboard) ? leaderboard.length : 0,
      });
      span.setStatus({ code: 1 });
      span.end();
      
      callback(null, {
        game: game,
        leaderboard: (Array.isArray(leaderboard) ? leaderboard : []).map(p => ({
          username: p.username,
          role: p.role || 'player',
          game: p.game || game,
          score: p.score || 0,
          metadata: JSON.stringify(p.metadata || {})
        }))
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  }

  async GetGameResults(call, callback) {
    // Extract trace context from gRPC call metadata
    const metadata = call.metadata || new grpc.Metadata();
    const carrier = extractMetadata(metadata);
    const extractedContext = propagation.extract(context.active(), carrier);
    
    const tracer = trace.getTracer('vegas-dashboard-service');
    const span = tracer.startSpan('dashboard.get_game_results', undefined, extractedContext);
    
    try {
      const { game, limit } = call.request;
      
      span.setAttributes({
        'dashboard.game': game,
        'dashboard.limit': limit || 50,
        'dashboard.operation': 'get_game_results',
      });
      
      // Try both endpoint formats - scoring service might use /api/game-results or /api/scoring/game-results
      const url = `${SCORING_SERVICE_URL}/api/game-results/${game}?limit=${limit || 50}`;
      const results = await fetchFromScoringService(url, span);
      
      span.setAttributes({
        'dashboard.record_count': Array.isArray(results) ? results.length : 0,
      });
      span.setStatus({ code: 1 });
      span.end();
      
      callback(null, {
        game: game,
        results: (Array.isArray(results) ? results : []).map(g => ({
          username: g.username,
          game: g.game || game,
          action: g.action || 'play',
          bet_amount: g.betAmount || 0,
          payout: g.payout || 0,
          win: g.win || false,
          result: g.result || 'lose',
          game_data: JSON.stringify(g.gameData || {}),
          metadata: JSON.stringify(g.metadata || {}),
          timestamp: g.timestamp || new Date().toISOString()
        }))
      });
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: 2, message: error.message });
      span.end();
      callback({ code: grpc.status.INTERNAL, message: error.message });
    }
  }
}

// Start gRPC server
function startGrpcServer() {
  const grpcPort = process.env.GRPC_PORT || '50055';
  const server = new grpc.Server();
  
  server.addService(dashboardProto.DashboardService.service, new DashboardServiceImpl());
  
  server.bindAsync(`0.0.0.0:${grpcPort}`, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('Failed to start gRPC server:', err);
      return;
    }
    console.log(`📊 Dashboard gRPC server listening on port ${port}`);
    server.start();
  });
}

// Start gRPC server
startGrpcServer();

// Keep process alive
process.on('SIGTERM', () => {
  console.log('Dashboard service shutting down...');
  process.exit(0);
});
