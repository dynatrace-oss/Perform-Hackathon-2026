/**
 * Vegas Casino Dashboard Service
 * Provides analytics and visualization dashboard for game statistics
 */

const express = require('express');
const path = require('path');
const { initializeTelemetry } = require('./common/opentelemetry');
const { trace, context, propagation } = require('@opentelemetry/api');
const Logger = require('./common/logger');

// Initialize OpenTelemetry
initializeTelemetry('vegas-dashboard-service', {
  version: '2.1.0',
  gameType: 'dashboard',
  gameCategory: 'analytics',
  complexity: 'medium',
  rtp: 'N/A',
  owner: 'Analytics-Team',
  technology: 'Node.js-Express-Dashboard',
  maxPayout: 'N/A'
});

const app = express();
const PORT = process.env.PORT || 3001;
const SCORING_SERVICE_URL = process.env.SCORING_SERVICE_URL || 'http://localhost:8085';

// Initialize Logger
const logger = new Logger('vegas-dashboard-service');

// Middleware to extract trace context from incoming requests
app.use((req, res, next) => {
  // Extract trace context from incoming request headers
  const extractedContext = propagation.extract(context.active(), req.headers);
  context.with(extractedContext, () => {
    next();
  });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.health_check');
  
  try {
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/health',
      'service.name': 'vegas-dashboard-service'
    });
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    res.json({ status: 'ok', service: 'vegas-dashboard-service' });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).json({ error: 'Health check failed' });
  }
});

// Dashboard API endpoints - proxy to scoring service
app.get('/api/dashboard/:game', async (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.get_stats');
  
  try {
    const { game } = req.params;
    const startTime = Date.now();
    
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/dashboard/:game',
      'dashboard.game': game,
      'dashboard.operation': 'get_dashboard_stats',
      'http.target': req.originalUrl
    });
    
    logger.logInfo('Fetching dashboard stats for game', {
      operation: 'get_dashboard_stats',
      game: game,
      scoring_service_url: `${SCORING_SERVICE_URL}/api/scoring/dashboard/${game}`
    });
    
    console.log(`[Dashboard] Fetching stats for game: ${game} from ${SCORING_SERVICE_URL}/api/scoring/dashboard/${game}`);
    
    // Inject trace context into fetch request
    const activeContext = context.active();
    const headers = {};
    propagation.inject(activeContext, headers);
    
    const response = await fetch(`${SCORING_SERVICE_URL}/api/scoring/dashboard/${game}`, {
      headers: headers
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Dashboard] Scoring service returned ${response.status}: ${errorText}`);
      
      span.setAttributes({
        'http.status_code': response.status,
        'error': true,
        'error.message': errorText.substring(0, 200)
      });
      span.recordException(new Error(`Scoring service returned ${response.status}`));
      span.setStatus({ code: 2, message: `HTTP ${response.status}` });
      span.end();
      
      logger.logError(new Error(`Scoring service returned ${response.status}`), {
        operation: 'get_dashboard_stats',
        game: game,
        status_code: response.status
      });
      throw new Error(`Scoring service returned ${response.status}: ${errorText}`);
    }
    
    const stats = await response.json();
    const duration = Date.now() - startTime;
    
    // Log record counts
    const totalGames = stats.totalGames || 0;
    const totalWins = stats.totalWins || 0;
    const totalLosses = stats.totalLosses || 0;
    const topPlayersCount = stats.topPlayers ? stats.topPlayers.length : 0;
    const recentGames = stats.recentGames || 0;
    
    span.setAttributes({
      'http.status_code': response.status,
      'dashboard.total_games': totalGames,
      'dashboard.total_wins': totalWins,
      'dashboard.total_losses': totalLosses,
      'dashboard.top_players_count': topPlayersCount,
      'dashboard.recent_games': recentGames,
      'http.response.duration_ms': duration
    });
    
    logger.logInfo('Successfully retrieved dashboard stats', {
      operation: 'get_dashboard_stats',
      game: game,
      record_counts: {
        total_games: totalGames,
        total_wins: totalWins,
        total_losses: totalLosses,
        top_players: topPlayersCount,
        recent_games: recentGames
      },
      duration_ms: duration,
      status_code: response.status
    });
    
    console.log(`[Dashboard] Successfully fetched stats for ${game}:`, JSON.stringify(stats).substring(0, 200));
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    res.json({ game, stats });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    
    logger.logError(error, {
      operation: 'get_dashboard_stats',
      game: req.params.game
    });
    console.error('[Dashboard] Error fetching dashboard stats:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.get_all_stats');
  
  try {
    const startTime = Date.now();
    
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/dashboard',
      'dashboard.operation': 'get_all_dashboard_stats',
      'http.target': req.originalUrl
    });
    
    logger.logInfo('Fetching dashboard stats for all games', {
      operation: 'get_all_dashboard_stats',
      scoring_service_url: `${SCORING_SERVICE_URL}/api/scoring/dashboard`
    });
    
    console.log(`[Dashboard] Fetching all stats from ${SCORING_SERVICE_URL}/api/scoring/dashboard`);
    
    // Inject trace context into fetch request
    const activeContext = context.active();
    const headers = {};
    propagation.inject(activeContext, headers);
    
    const response = await fetch(`${SCORING_SERVICE_URL}/api/scoring/dashboard`, {
      headers: headers
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Dashboard] Scoring service returned ${response.status}: ${errorText}`);
      
      span.setAttributes({
        'http.status_code': response.status,
        'error': true,
        'error.message': errorText.substring(0, 200)
      });
      span.recordException(new Error(`Scoring service returned ${response.status}`));
      span.setStatus({ code: 2, message: `HTTP ${response.status}` });
      span.end();
      
      logger.logError(new Error(`Scoring service returned ${response.status}`), {
        operation: 'get_all_dashboard_stats',
        status_code: response.status
      });
      
      // Return empty array instead of throwing error - frontend will show "no data" message
      console.warn('[Dashboard] Returning empty stats array due to scoring service error');
      span.setStatus({ code: 1 }); // Mark as OK since we're handling gracefully
      span.end();
      return res.json({ stats: [] });
    }
    
    const stats = await response.json();
    const duration = Date.now() - startTime;
    
    // Handle both array and object responses from scoring service
    let statsArray;
    if (Array.isArray(stats)) {
      statsArray = stats;
    } else if (stats && typeof stats === 'object' && stats.stats) {
      // If wrapped in an object with 'stats' property
      statsArray = Array.isArray(stats.stats) ? stats.stats : [stats.stats];
    } else if (stats && typeof stats === 'object') {
      // Single stats object
      statsArray = [stats];
    } else {
      // Fallback: empty array
      statsArray = [];
    }
    
    // Ensure all items in statsArray are valid objects with game property
    statsArray = statsArray.filter(s => s && typeof s === 'object' && (s.game || s.totalGames !== undefined));
    
    // If no valid stats found, return empty array (frontend will handle "no data" display)
    if (statsArray.length === 0) {
      console.warn('[Dashboard] No valid stats found in response, returning empty array');
      logger.logInfo('No valid stats found for all games', {
        operation: 'get_all_dashboard_stats',
        response_type: Array.isArray(stats) ? 'array' : typeof stats,
        response_length: Array.isArray(stats) ? stats.length : 'N/A'
      });
    }
    
    // Calculate total record counts across all games (safe even if array is empty)
    const totalGames = statsArray.reduce((sum, s) => sum + (s.totalGames || 0), 0);
    const totalWins = statsArray.reduce((sum, s) => sum + (s.totalWins || 0), 0);
    const totalTopPlayers = statsArray.reduce((sum, s) => sum + (s.topPlayers ? s.topPlayers.length : 0), 0);
    
    span.setAttributes({
      'http.status_code': response.status,
      'dashboard.games_count': statsArray.length,
      'dashboard.total_games': totalGames,
      'dashboard.total_wins': totalWins,
      'dashboard.total_top_players': totalTopPlayers,
      'http.response.duration_ms': duration
    });
    
    logger.logInfo('Successfully retrieved dashboard stats for all games', {
      operation: 'get_all_dashboard_stats',
      record_counts: {
        games_count: statsArray.length,
        total_games: totalGames,
        total_wins: totalWins,
        total_top_players: totalTopPlayers
      },
      duration_ms: duration,
      status_code: response.status
    });
    
    console.log(`[Dashboard] Successfully fetched all stats: ${statsArray.length} games`);
    console.log(`[Dashboard] Stats array:`, statsArray.map(s => s.game || 'unknown').join(', '));
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    // Always return { stats: [...] } format for consistency
    res.json({ stats: statsArray });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    
    logger.logError(error, {
      operation: 'get_all_dashboard_stats'
    });
    console.error('[Dashboard] Error fetching dashboard stats:', error.message, error.stack);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', details: error.message });
  }
});

app.get('/api/leaderboard/:game', async (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.get_leaderboard');
  
  try {
    const { game } = req.params;
    const limit = parseInt(req.query.limit || '10');
    const startTime = Date.now();
    
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/leaderboard/:game',
      'dashboard.game': game,
      'dashboard.operation': 'get_leaderboard',
      'dashboard.limit': limit,
      'http.target': req.originalUrl
    });
    
    logger.logInfo('Fetching leaderboard records', {
      operation: 'get_leaderboard',
      game: game,
      limit: limit,
      scoring_service_url: `${SCORING_SERVICE_URL}/api/scoring/leaderboard/${game}?limit=${limit}`
    });
    
    // Inject trace context into fetch request
    const activeContext = context.active();
    const headers = {};
    propagation.inject(activeContext, headers);
    
    const response = await fetch(`${SCORING_SERVICE_URL}/api/scoring/leaderboard/${game}?limit=${limit}`, {
      headers: headers
    });
    
    if (!response.ok) {
      span.setAttributes({
        'http.status_code': response.status,
        'error': true
      });
      span.recordException(new Error(`Scoring service returned ${response.status}`));
      span.setStatus({ code: 2, message: `HTTP ${response.status}` });
      span.end();
      
      logger.logError(new Error(`Scoring service returned ${response.status}`), {
        operation: 'get_leaderboard',
        game: game,
        status_code: response.status
      });
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const leaderboard = await response.json();
    const duration = Date.now() - startTime;
    const recordCount = Array.isArray(leaderboard) ? leaderboard.length : 0;
    
    span.setAttributes({
      'http.status_code': response.status,
      'dashboard.record_count': recordCount,
      'dashboard.limit': limit,
      'http.response.duration_ms': duration
    });
    
    logger.logInfo('Successfully retrieved leaderboard records', {
      operation: 'get_leaderboard',
      game: game,
      record_count: recordCount,
      limit: limit,
      duration_ms: duration,
      status_code: response.status
    });
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    res.json({ game, leaderboard });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    
    logger.logError(error, {
      operation: 'get_leaderboard',
      game: req.params.game
    });
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

app.get('/api/game-results/:game', async (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.get_game_results');
  
  try {
    const { game } = req.params;
    const limit = parseInt(req.query.limit || '50');
    const startTime = Date.now();
    
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/api/game-results/:game',
      'dashboard.game': game,
      'dashboard.operation': 'get_game_results',
      'dashboard.limit': limit,
      'http.target': req.originalUrl
    });
    
    logger.logInfo('Fetching game results records', {
      operation: 'get_game_results',
      game: game,
      limit: limit,
      scoring_service_url: `${SCORING_SERVICE_URL}/api/scoring/game-results/${game}?limit=${limit}`
    });
    
    // Inject trace context into fetch request
    const activeContext = context.active();
    const headers = {};
    propagation.inject(activeContext, headers);
    
    const response = await fetch(`${SCORING_SERVICE_URL}/api/scoring/game-results/${game}?limit=${limit}`, {
      headers: headers
    });
    
    if (!response.ok) {
      span.setAttributes({
        'http.status_code': response.status,
        'error': true
      });
      span.recordException(new Error(`Scoring service returned ${response.status}`));
      span.setStatus({ code: 2, message: `HTTP ${response.status}` });
      span.end();
      
      logger.logError(new Error(`Scoring service returned ${response.status}`), {
        operation: 'get_game_results',
        game: game,
        status_code: response.status
      });
      throw new Error(`Scoring service returned ${response.status}`);
    }
    
    const results = await response.json();
    const duration = Date.now() - startTime;
    const recordCount = Array.isArray(results) ? results.length : 0;
    
    span.setAttributes({
      'http.status_code': response.status,
      'dashboard.record_count': recordCount,
      'dashboard.limit': limit,
      'http.response.duration_ms': duration
    });
    
    logger.logInfo('Successfully retrieved game results records', {
      operation: 'get_game_results',
      game: game,
      record_count: recordCount,
      limit: limit,
      duration_ms: duration,
      status_code: response.status
    });
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    res.json({ game, results });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    
    logger.logError(error, {
      operation: 'get_game_results',
      game: req.params.game
    });
    console.error('Error fetching game results:', error);
    res.status(500).json({ error: 'Failed to fetch game results' });
  }
});

// Serve dashboard page
app.get('/', (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.serve_page');
  
  try {
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/',
      'dashboard.operation': 'serve_dashboard_page'
    });
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).send('Error loading dashboard');
  }
});

// Also serve at /dashboard for gateway routing
app.get('/dashboard', (req, res) => {
  const tracer = trace.getTracer('vegas-dashboard-service');
  const span = tracer.startSpan('dashboard.serve_page');
  
  try {
    span.setAttributes({
      'http.method': 'GET',
      'http.route': '/dashboard',
      'dashboard.operation': 'serve_dashboard_page'
    });
    
    span.setStatus({ code: 1 }); // OK
    span.end();
    
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
    span.end();
    res.status(500).send('Error loading dashboard');
  }
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`📊 Dashboard HTTP server listening on port ${PORT}`);
  console.log(`📊 Scoring service URL: ${SCORING_SERVICE_URL}`);
});

// Start gRPC server
require('./dashboard-service-grpc');


