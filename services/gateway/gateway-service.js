
/**
 * Dynatrace Vegas Casino Server
 * A Node.js casino application with Smartscape-inspired UI and real-time telemetry
 * 
 * Features:
 * - WebSocket-based real-time metric updates
 * - Telemetry simulation via /metrics route
 * - Game APIs for Roulette, Slots, Dice Roll, and Blackjack
 * - Dynatrace-style logging and monitoring
 */

const express = require('express');
const http = require('http');
const { spawn } = require('child_process');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const { promisify } = require('util');
const ServiceManager = require('./services/common/service-manager');

const writeFile = promisify(fs.writeFile);
const appendFile = promisify(fs.appendFile);
const mkdir = promisify(fs.mkdir);

// Simple logging function - no trace correlation
function logWithTrace(level, message, data = {}) {
  console.log(`[${level.toUpperCase()}] ${message}`);
}

// Initialize OpenTelemetry
const { initializeTelemetry } = require('./services/common/opentelemetry');
const tracer = initializeTelemetry('vegas-casino-gateway', {
  version: '2.1.0',
  gameCategory: 'gateway',
  technology: 'Node.js-Express',
  owner: 'Vegas-Casino-Team',
});

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Trace context middleware for log correlation - TEMPORARILY DISABLED
/*
app.use((req, res, next) => {
  try {
    // Extract Dynatrace trace context from headers
    let traceId = req.headers['x-dynatrace-traceid'] || req.headers['dt-trace-id'];
    let spanId = req.headers['x-dynatrace-spanid'] || req.headers['dt-span-id'];
    
    // Parse traceparent header if available (W3C format: version-trace_id-span_id-flags)
    const traceparent = req.headers['traceparent'];
    if (!traceId && traceparent && typeof traceparent === 'string') {
      const parts = traceparent.split('-');
      if (parts.length >= 3) {
        traceId = parts[1];
        spanId = parts[2];
      }
    }
    
    // Fallback to generated IDs if none found
    if (!traceId) traceId = crypto.randomUUID();
    if (!spanId) spanId = crypto.randomUUID().substring(0, 16);
    
    // Store trace context in request for use in logging
    req.traceContext = {
      traceId,
      spanId,
      timestamp: new Date().toISOString()
    };
    
    // Trace context is automatically propagated via W3C Trace Context headers
    // No need to set environment variables for trace context
    
    next();
  } catch (error) {
    console.error('Error in trace context middleware:', error);
    // Continue without trace context if there's an error
    req.traceContext = {
      traceId: crypto.randomUUID(),
      spanId: crypto.randomUUID().substring(0, 16),
      timestamp: new Date().toISOString()
    };
    next();
  }
});
*/

// Middleware
// Custom JSON parser that handles Python-style syntax from Dynatrace
// Accept any content-type for this route because Dynatrace may send text/plain or other types
app.use('/api/admin/lockout-user-cheat', express.text({type: '*/*'}));
app.use('/api/admin/lockout-user-cheat', (req, res, next) => {
  if (req.body && typeof req.body === 'string') {
    try {
      console.log('📥 Raw text from Dynatrace:', req.body);
      
      // Fix Python-style JSON to proper JSON
      let fixedJson = req.body
        .replace(/'/g, '"')          // Single quotes to double quotes
        .replace(/False/g, 'false')   // Python False to JSON false
        .replace(/True/g, 'true')     // Python True to JSON true
        .replace(/None/g, 'null');    // Python None to JSON null
      
      console.log('📥 Fixed JSON:', fixedJson);
      req.body = JSON.parse(fixedJson);
      console.log('📥 Parsed body:', JSON.stringify(req.body, null, 2));
    } catch (e) {
      console.error('Failed to parse Python-style JSON:', e);
      return res.status(400).json({ 
        error: 'Invalid JSON format', 
        details: e.message,
        hint: 'Check for Python-style syntax (single quotes, False/True/None)',
        receivedText: req.body.substring(0, 200) + '...'
      });
    }
  }
  next();
});

app.use(express.json());

app.use(cors());
// Static files are now served by the frontend service
// app.use(express.static(path.join(__dirname, 'public')));

// OpenTelemetry middleware - add attributes to spans
app.use((req, res, next) => {
  const { trace } = require('@opentelemetry/api');
  const tracer = trace.getTracer('vegas-casino-gateway');
  const span = tracer.startSpan(`${req.method} ${req.path}`);
  
  // Set HTTP semantic convention attributes
  span.setAttributes({
    'http.method': req.method,
    'http.route': req.path,
    'http.target': req.url,
    'http.scheme': req.protocol,
    'http.user_agent': req.get('user-agent') || '',
  });

  // Set game attributes if API request
  if (req.path.includes('/api/')) {
    const gameType = req.path.split('/')[2]; // slots, roulette, dice, blackjack
    span.setAttribute('game.request', gameType || 'unknown');
    span.setAttribute('request.type', 'api-proxy');
  } else {
    span.setAttribute('request.type', 'static-asset');
  }

  // Store span in request
  const { context } = require('@opentelemetry/api');
  const ctx = trace.setSpan(context.active(), span);
  context.with(ctx, () => {
    req.span = span;
    next();
  });

  // End span when response finishes
  res.on('finish', () => {
    span.setAttribute('http.status_code', res.statusCode);
    span.end();
  });
});

// --- Internal service launcher & proxy (no SDK) ---
// We'll spawn lightweight child processes per service and proxy requests to them via HTTP.
// OneAgent will see separate processes/services and build a proper topology.
const childServices = {};
const SERVICE_PORTS = {
  'vegas-slots-service': 8081,
  'vegas-roulette-service': 8082,
  'vegas-dice-service': 8083,
  'vegas-blackjack-service': 8084
};

// Initialize Service Manager for microservices architecture
const serviceManager = new ServiceManager();

function startChildService(name, script, env = {}) {
  if (childServices[name]) return childServices[name];
  
  // Enhanced environment variables for OpenTelemetry
  const enhancedEnv = {
    ...process.env,
    PORT: String(SERVICE_PORTS[name] || 0),
    SERVICE_NAME: name,
    // OpenTelemetry service configuration
    SERVICE_NAMESPACE: 'vegas-casino',
    SERVICE_VERSION: '2.1.0',
    SERVICE_INSTANCE_ID: `${name}-${process.pid}`,
    DEPLOYMENT_ENVIRONMENT: 'production',
    // Game-specific configuration
    GAME_CATEGORY: getGameCategory(name),
    GAME_TYPE: getGameType(name),
    GAME_COMPLEXITY: getServiceComplexity(name),
    GAME_MAX_PAYOUT: getMaxPayout(name),
    GAME_OWNER: getBusinessUnit(name),
    // OTLP endpoint
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
    ...env
  };
  
  const child = spawn('node', [script], {
    cwd: path.join(__dirname, '..', '..'),
    env: enhancedEnv,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', d => console.log(`[${name}] ${d.toString().trim()}`));
  child.stderr.on('data', d => console.error(`[${name}][ERR] ${d.toString().trim()}`));
  child.on('exit', code => {
    console.log(`[${name}] exited with code ${code}`);
    delete childServices[name];
  });
  childServices[name] = child;
  return child;
}

// Helper functions for Dynatrace metadata
function getGameCategory(serviceName) {
  const categories = {
    'vegas-slots-service': 'slot-machines',
    'vegas-roulette-service': 'table-games',
    'vegas-dice-service': 'dice-games',
    'vegas-blackjack-service': 'card-games'
  };
  return categories[serviceName] || 'unknown';
}

function getServiceComplexity(serviceName) {
  const complexity = {
    'vegas-slots-service': 'high',
    'vegas-roulette-service': 'high',
    'vegas-dice-service': 'medium',
    'vegas-blackjack-service': 'high'
  };
  return complexity[serviceName] || 'medium';
}

function getMaxPayout(serviceName) {
  const payouts = {
    'vegas-slots-service': '100x',
    'vegas-roulette-service': '36x',
    'vegas-dice-service': '2x',
    'vegas-blackjack-service': '2.5x'
  };
  return payouts[serviceName] || '1x';
}

// Additional helper functions for distinct Dynatrace process groups
function getServiceCluster(serviceName) {
  const clusters = {
    'vegas-slots-service': 'vegas-slots-cluster',
    'vegas-roulette-service': 'vegas-roulette-cluster',
    'vegas-dice-service': 'vegas-dice-cluster',
    'vegas-blackjack-service': 'vegas-blackjack-cluster'
  };
  return clusters[serviceName] || 'vegas-casino-cluster';
}

function getGameType(serviceName) {
  const gameTypes = {
    'vegas-slots-service': 'slots-machine',
    'vegas-roulette-service': 'european-roulette',
    'vegas-dice-service': 'craps-dice',
    'vegas-blackjack-service': 'blackjack-21'
  };
  return gameTypes[serviceName] || 'unknown';
}

function getBusinessUnit(serviceName) {
  const businessUnits = {
    'vegas-slots-service': 'Slot-Machine-Division',
    'vegas-roulette-service': 'Table-Games-Division',
    'vegas-dice-service': 'Dice-Games-Division',
    'vegas-blackjack-service': 'Card-Games-Division'
  };
  return businessUnits[serviceName] || 'Digital-Gaming';
}

function proxyJson(targetPort, req, res) {
  // Use K8s service names if running in Kubernetes, otherwise use localhost
  const isK8s = process.env.KUBERNETES_SERVICE_HOST || process.env.SLOTS_SERVICE_URL;
  const hostname = isK8s ? getServiceHostname(targetPort) : '127.0.0.1';
  
  const options = {
    hostname: hostname,
    port: targetPort,
    path: req.url.replace(/^\/api\/(slots|roulette|dice|blackjack)/, ''),
    method: req.method,
    headers: { 'Content-Type': 'application/json' }
  };

  const proxyReq = http.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', err => {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: 'Service unavailable', details: err.message }));
  });
  if (req.body && Object.keys(req.body).length) {
    proxyReq.end(JSON.stringify(req.body));
  } else {
    proxyReq.end();
  }
}

// --- Simple in-memory user store for per-user balance persistence ---
const DEFAULT_START_BALANCE = 1000;
const users = new Map(); // key: username, value: { username, balance }

function getOrCreateUser(username) {
  const key = (username || 'Anonymous').trim() || 'Anonymous';
  if (!users.has(key)) {
    users.set(key, { username: key, balance: DEFAULT_START_BALANCE });
  }
  return users.get(key);
}

function updateUserBalance(username, delta) {
  const user = getOrCreateUser(username);
  user.balance = Math.max(0, (user.balance || 0) + Number(delta || 0));
  return user.balance;
}

// Enhanced Dynatrace Metadata Endpoints (similar to BizObs)
app.get('/api/services/metadata', (req, res) => {
  const serviceMetadata = {
    application: 'Vegas-Casino-Microservices',
    version: '2.1.0',
    environment: 'vegas-casino-production',
    cluster: 'vegas-casino-cluster',
    timestamp: new Date().toISOString(),
    services: [
      {
        name: 'vegas-slots-service',
        port: 8081,
        gameType: 'slots-machine',
        complexity: 'high',
        rtp: '96.5%',
        maxPayout: '100x',
        features: ['progressive-jackpot', 'bonus-rounds', 'cheat-detection', 'real-time-metrics'],
        status: childServices['vegas-slots-service'] ? 'running' : 'stopped'
      },
      {
        name: 'vegas-roulette-service',
        port: 8082,
        gameType: 'european-roulette',
        complexity: 'high',
        rtp: '97.3%',
        maxPayout: '36x',
        features: ['multiple-bet-types', 'live-wheel', 'cheat-detection', 'advanced-statistics'],
        status: childServices['vegas-roulette-service'] ? 'running' : 'stopped'
      },
      {
        name: 'vegas-dice-service',
        port: 8083,
        gameType: 'craps-dice',
        complexity: 'medium',
        rtp: '98.6%',
        maxPayout: '2x',
        features: ['dual-dice-roll', 'craps-rules', 'pass-line-betting', 'real-time-results'],
        status: childServices['vegas-dice-service'] ? 'running' : 'stopped'
      },
      {
        name: 'vegas-blackjack-service',
        port: 8084,
        gameType: 'blackjack-21',
        complexity: 'high',
        rtp: '99.5%',
        maxPayout: '2.5x',
        features: ['card-counting-resistant', 'dealer-ai', 'multi-action', 'session-state'],
        status: childServices['vegas-blackjack-service'] ? 'running' : 'stopped'
      }
    ],
    businessContext: {
      industry: 'Gaming',
      businessUnit: 'Digital Casino',
      owner: 'Vegas-Casino-Team',
      criticality: 'high',
      dataClassification: 'internal'
    }
  };
  
  res.json(serviceMetadata);
});

// Service Health Check Endpoint
app.get('/api/services/health', (req, res) => {
  const healthStatus = {
    timestamp: new Date().toISOString(),
    overallStatus: 'healthy',
    services: {}
  };
  
  Object.keys(SERVICE_PORTS).forEach(serviceName => {
    healthStatus.services[serviceName] = {
      status: childServices[serviceName] ? 'running' : 'stopped',
      port: SERVICE_PORTS[serviceName],
      uptime: childServices[serviceName] ? 'active' : 'inactive'
    };
  });
  
  res.json(healthStatus);
});

// ===== Microservices Management API =====

/**
 * Get all services status
 */
app.get('/api/services/status', (req, res) => {
  const statuses = serviceManager.getAllServicesStatus();
  res.json({
    timestamp: new Date().toISOString(),
    services: statuses
  });
});

/**
 * Get specific service status
 */
app.get('/api/services/status/:serviceName', (req, res) => {
  const { serviceName } = req.params;
  const status = serviceManager.getServiceStatus(serviceName);
  res.json(status);
});

/**
 * Start a service
 */
app.post('/api/services/start/:serviceName', (req, res) => {
  const { serviceName } = req.params;
  const result = serviceManager.startService(serviceName);
  res.json(result);
});

/**
 * Stop a service
 */
app.post('/api/services/stop/:serviceName', (req, res) => {
  const { serviceName } = req.params;
  const result = serviceManager.stopService(serviceName);
  res.json(result);
});

/**
 * Restart a service
 */
app.post('/api/services/restart/:serviceName', (req, res) => {
  const { serviceName } = req.params;
  const result = serviceManager.restartService(serviceName);
  res.json(result);
});

/**
 * Get service configurations
 */
app.get('/api/services/config', (req, res) => {
  const configs = serviceManager.getAllServiceConfigs();
  res.json({
    timestamp: new Date().toISOString(),
    services: configs
  });
});

/**
 * Check service health
 */
app.get('/api/services/health/:serviceName', async (req, res) => {
  const { serviceName } = req.params;
  const healthy = await serviceManager.checkServiceHealth(serviceName);
  res.json({
    service: serviceName,
    healthy: healthy,
    timestamp: new Date().toISOString()
  });
});

// User API
app.post('/api/user/init', (req, res) => {
  const username = (req.body && (req.body.Username || req.body.username)) || 'Anonymous';
  const user = getOrCreateUser(username);
  res.json({ username: user.username, balance: user.balance });
});

app.get('/api/user/balance', (req, res) => {
  const username = req.query.username || 'Anonymous';
  const user = getOrCreateUser(username);
  res.json({ username: user.username, balance: user.balance });
});

// Persistent Top-Up endpoint
app.post('/api/user/topup', (req, res) => {
  const username = (req.body && (req.body.Username || req.body.username)) || 'Anonymous';
  const amount = Number((req.body && (req.body.Amount || req.body.amount)) || 500);
  updateUserBalance(username, Math.max(0, amount));
  const user = getOrCreateUser(username);
  // Log BizEvent for top-up action
  logTelemetry('USER_TOPUP', {
    action: 'topup',
    username: user.username,
    amount: amount,
    balance: user.balance,
    correlationId: generateCorrelationId()
  });
  res.json({ username: user.username, balance: user.balance });
});

// Cheat Activity Logging Endpoint
app.post('/api/log-cheat', async (req, res) => {
  try {
    const logEntry = req.body;
    
    // Create logs directory if it doesn't exist
    const logsDir = path.join(__dirname, 'vegas-cheat-logs');
    try {
      await mkdir(logsDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error('Error creating logs directory:', err);
      }
    }
    
    // Create filename with date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFileName = `vegas-cheating-${today}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Format log entry with flattened structure for OneAgent capture
    const formattedLogEntry = {
      timestamp: logEntry.timestamp,
      level: 'WARN',
      event_type: 'CASINO_CHEATING_ATTEMPT',
      game: logEntry.game,
      action: logEntry.action,
      cheat_type: logEntry.cheatType,
      
      // Flattened player information
      customer_name: logEntry.player.customerName,
      email: logEntry.player.email,
      company_name: logEntry.player.companyName,
      persona: logEntry.player.persona,
      booth: logEntry.player.booth,
      
      // Flattened cheat details
      cheat_name: logEntry.cheatDetails ? logEntry.cheatDetails.name : null,
      cheat_cost: logEntry.cheatDetails ? logEntry.cheatDetails.cost : null,
      cheat_win_boost: logEntry.cheatDetails ? logEntry.cheatDetails.winBoost : null,
      cheat_detection_risk: logEntry.cheatDetails ? logEntry.cheatDetails.detectionRisk : null,
      
      // Flattened session information
      balance: logEntry.sessionInfo.balance,
      total_activations_today: logEntry.sessionInfo.totalActivationsToday,
      current_detection_risk: logEntry.sessionInfo.currentDetectionRisk,
      
      // Flattened game context
      bet_amount: logEntry.gameContext ? logEntry.gameContext.currentBetAmount : null,
      win_amount: logEntry.gameContext ? logEntry.gameContext.lastWinAmount : null,
      last_multiplier: logEntry.gameContext ? logEntry.gameContext.lastMultiplier : null,
      last_result: logEntry.gameContext ? logEntry.gameContext.lastResult : null,
      correlation_id: logEntry.gameContext ? logEntry.gameContext.correlationId : null,
      
      // Flattened consent
      opt_in: logEntry.optInConsent,
      
      // Flattened security information
      severity: logEntry.action === 'activate' ? 'HIGH' : 'MEDIUM',
      category: 'FRAUD_PREVENTION',
      requires_investigation: logEntry.sessionInfo.currentDetectionRisk > 50
    };
    
    // Append to log file
    const logLine = JSON.stringify(formattedLogEntry) + '\n';
    await appendFile(logFilePath, logLine);
    
    console.log(`[CHEAT-LOG] ${logEntry.action} ${logEntry.cheatType} by ${logEntry.player.customerName}`);
    
    res.json({ 
      success: true, 
      message: 'Cheat activity logged successfully',
      logFile: logFileName 
    });
    
  } catch (error) {
    console.error('Error logging cheat activity:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to log cheat activity' 
    });
  }
});

// Comprehensive Game Activity Logging with Flattened Structure
async function logGameActivity(game, action, playerData, gameDetails) {
  try {
    const logsDir = path.join(__dirname, 'vegas-cheat-logs');
    
    // Ensure logs directory exists
    try {
      await mkdir(logsDir, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') {
        console.error('Error creating logs directory:', err);
      }
    }
    
    // Create filename with date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logFileName = `vegas-activity-${today}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Format comprehensive log entry with all fields flattened to top level
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: gameDetails.cheatActive ? 'SECURITY_ALERT' : 'INFO',
      event_type: 'CASINO_GAME_ACTIVITY',
      game: game,
      action: action,
      
      // Flattened player information
      customer_name: playerData.customerName || playerData.Username || 'Anonymous',
      email: playerData.email || '',
      company_name: playerData.companyName || '',
      persona: playerData.persona || '',
      booth: playerData.booth || '',
      
      // Flattened game details
      bet_amount: gameDetails.betAmount || 0,
      win_amount: gameDetails.winAmount || 0,
      balance_before: gameDetails.balanceBefore || 0,
      balance_after: gameDetails.balanceAfter || 0,
      result: gameDetails.result || null,
      multiplier: gameDetails.multiplier || 0,
      
      // Flattened cheat information
      cheat_active: gameDetails.cheatActive || false,
      cheat_type: gameDetails.cheatActive ? gameDetails.cheatType : null,
      cheat_win_boost_applied: gameDetails.cheatActive ? (gameDetails.cheatApplied || false) : false,
      cheat_original_win: gameDetails.cheatActive ? (gameDetails.originalWinAmount || 0) : 0,
      cheat_boosted_win: gameDetails.cheatActive ? (gameDetails.winAmount || 0) : 0,
      
      // Flattened session information
      correlation_id: gameDetails.correlationId || generateCorrelationId(),
      user_agent: 'Vegas-Casino-Browser',
      ip_address: 'internal',
      
      // Flattened consent
      opt_in: playerData.optIn || false,
      
      // Flattened security information
      severity: gameDetails.cheatActive ? 'HIGH' : 'LOW',
      category: gameDetails.cheatActive ? 'FRAUD_DETECTION' : 'GAME_ACTIVITY',
      requires_investigation: gameDetails.cheatActive || false
    };
    
    // Append to log file
    const logLine = JSON.stringify(logEntry) + '\n';
    await appendFile(logFilePath, logLine);
    
    // IMPORTANT: Also log to console for Dynatrace OneAgent to capture
    console.log(`VEGAS_GAME_ACTIVITY: ${JSON.stringify(logEntry)}`);
    
    // Simple console logging for visibility
    console.log(`[GAME-LOG] ${game.toUpperCase()}: ${action} by ${playerData.customerName || playerData.Username} - Bet: $${gameDetails.betAmount || 0}, Win: $${gameDetails.winAmount || 0}`);
    
  } catch (error) {
    console.error('Error logging game activity:', error);
  }
}

// Helper to call child service and parse JSON
function callChildJson(targetPort, pathName, payload) {
  return new Promise((resolve, reject) => {
    // Use K8s service names if running in Kubernetes, otherwise use localhost
    const isK8s = process.env.KUBERNETES_SERVICE_HOST || process.env.SLOTS_SERVICE_URL;
    const hostname = isK8s ? getServiceHostname(targetPort) : '127.0.0.1';
    
    const options = {
      hostname: hostname,
      port: targetPort,
      path: pathName,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    const req2 = http.request(options, (res2) => {
      let body = '';
      res2.setEncoding('utf8');
      res2.on('data', chunk => body += chunk);
      res2.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve(json);
        } catch (e) {
          reject(new Error(`Invalid JSON from child service on port ${targetPort}: ${e.message}`));
        }
      });
    });
    req2.on('error', reject);
    req2.end(JSON.stringify(payload || {}));
  });
}

// Game configuration
const GAME_CONFIG = {
  slots: {
    icons: [
      // Premium Dynatrace Symbols (Highest Payouts)
      'dynatrace', 'smartscape', 'application', 'database',
      // Technology Symbols (High Payouts)  
      'server', 'cloud', 'shield', 'chart', 'network',
      // Service Symbols (Medium Payouts)
      'services', 'host', 'process', 'memory', 'cpu'
    ],
    multipliers: { 3: 5, 2: 2 },
    baseWinChance: 0.15,
    // Enhanced payout system
    payouts: {
      triple: {
        'dynatrace': 100, 'smartscape': 50, 'application': 25, 'database': 20,
        'server': 15, 'cloud': 12, 'shield': 10, 'chart': 8, 'network': 6,
        'services': 4, 'host': 3, 'process': 2, 'memory': 2, 'cpu': 2
      },
      double: {
        'dynatrace': 10, 'smartscape': 5, 'application': 3, 'database': 2,
        'server': 2, 'cloud': 1.5, 'shield': 1.5, 'chart': 1.2, 'network': 1.2,
        'services': 1, 'host': 1, 'process': 0.5, 'memory': 0.5, 'cpu': 0.5
      }
    }
  },
  roulette: {
    numbers: Array.from({ length: 37 }, (_, i) => i), // 0-36
    colors: { red: [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36], black: [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35] },
    payouts: { straight: 35, split: 17, street: 11, corner: 8, sixline: 5, column: 2, dozen: 2, evenodd: 1, redblack: 1, highlow: 1 }
  },
  dice: {
    sides: 6,
    combinations: {
      snake_eyes: { dice: [1, 1], multiplier: 30 },
      boxcars: { dice: [6, 6], multiplier: 30 },
      hard_eight: { dice: [4, 4], multiplier: 9 },
      hard_six: { dice: [3, 3], multiplier: 9 },
      seven_out: { sum: 7, multiplier: 4 }
    }
  },
  blackjack: {
    deck: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    suits: ['hearts', 'diamonds', 'clubs', 'spades'],
    blackjackPayout: 1.5,
    insurancePayout: 2
  }
};

// Telemetry storage
let gameMetrics = {
  totalSpins: 0,
  totalWins: 0,
  totalLosses: 0,
  totalRevenue: 0,
  totalPayout: 0,
  activeUsers: 0,
  gamesPlayed: { slots: 0, roulette: 0, dice: 0, blackjack: 0 },
  averageSessionTime: 0,
  errors: [],
  systemHealth: {
    cpu: 0,
    memory: 0,
    latency: 0,
    uptime: 0
  }
};

// User sessions for tracking
const userSessions = new Map();

// OpenTelemetry Configuration
const PORT = process.env.PORT || 8080;
const OTEL_CONFIG = {
  endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
  serviceName: 'vegas-casino-gateway',
  serviceVersion: '2.1.0',
  environment: process.env.DEPLOYMENT_ENVIRONMENT || 'production',
};

// Service Identification for Dynatrace
const SERVICE_NAMES = {
  casino: 'vegas-casino-main',
  slots: 'vegas-slots-service',
  roulette: 'vegas-roulette-service',
  dice: 'vegas-dice-service',
  blackjack: 'vegas-blackjack-service',
  analytics: 'vegas-analytics-service',
  leaderboard: 'vegas-leaderboard-service'
};

// Utility functions
function generateCorrelationId() {
  return crypto.randomBytes(8).toString('hex');
}

// Slots game logic
function spinSlots(betAmount) {
  return new Promise((resolve) => {
    // Generate slot result
    const result = Array.from({ length: 3 }, () => 
      GAME_CONFIG.slots.icons[Math.floor(Math.random() * GAME_CONFIG.slots.icons.length)]
    );
    
    // Enhanced win calculation
    const symbolCounts = {};
    result.forEach(symbol => {
      symbolCounts[symbol] = (symbolCounts[symbol] || 0) + 1;
    });
    
    let isWin = false;
    let multiplier = 0;
    let winType = '';
    
    // Check for triple matches first (highest priority)
    for (const [symbol, count] of Object.entries(symbolCounts)) {
      if (count === 3) {
        multiplier = GAME_CONFIG.slots.payouts.triple[symbol] || 2;
        isWin = true;
        winType = 'triple';
        break;
      }
    }
    
    // If no triple, check for double matches
    if (!isWin) {
      for (const [symbol, count] of Object.entries(symbolCounts)) {
        if (count === 2) {
          multiplier = GAME_CONFIG.slots.payouts.double[symbol] || 1;
          isWin = true;
          winType = 'double';
          break;
        }
      }
    }
    
    const winAmount = isWin ? betAmount * multiplier : 0;
    
    const responseData = {
      result,
      win: isWin,
      winAmount,
      betAmount,
      multiplier: isWin ? multiplier : 0,
      winType,
      correlationId: generateCorrelationId(),
      timestamp: new Date().toISOString()
    };
    
    resolve(responseData);
  });
}

// Dynatrace BizEvents payload builder
function createBizEvent(eventType, data) {
  const serviceName = data.service || SERVICE_NAMES.casino;
  
  // Extract Vegas Casino specific data for rqBody
  const vegasCasinoData = { ...data };
  delete vegasCasinoData.service; // Remove service from the payload
  
  const baseEvent = {
    specversion: '1.0',
    type: `com.dynatrace.vegas.${eventType}`,
    source: serviceName,
    id: generateCorrelationId(),
    time: new Date().toISOString(),
    dt: {
      entity: {
        type: 'SERVICE',
        name: serviceName
      },
      trace_id: generateCorrelationId(),
      span_id: generateCorrelationId()
    },
    data: {
      casino: 'Dynatrace Vegas',
      environment: DYNATRACE_CONFIG.environment,
      service: serviceName,
      // Put the actual Vegas Casino game data in rqBody
      rqBody: vegasCasinoData
    }
  };
  
  return baseEvent;
}

// Send BizEvent to Dynatrace
function sendBizEvent(eventType, data) {
  const bizEvent = createBizEvent(eventType, data);
  
  // Log BizEvent for debugging
  console.log(`📊 BizEvent [${eventType}]:`, JSON.stringify(bizEvent, null, 2));
  
  // In a real implementation, send to Dynatrace Ingest API
  if (DYNATRACE_CONFIG.ingestEndpoint && DYNATRACE_CONFIG.apiToken) {
    // TODO: Implement actual HTTP POST to Dynatrace Ingest API
    // fetch(DYNATRACE_CONFIG.ingestEndpoint + '/v1/events/ingest', { ... })
  }
  
  return bizEvent;
}

function logTelemetry(event, data) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${event}:`, JSON.stringify(data, null, 2));
  
  // Send corresponding BizEvent to Dynatrace
  if (event.includes('GAME_') || event.includes('USER_') || event.includes('SPIN') || event.includes('DEAL')) {
    const eventType = event.toLowerCase().replace('_', '.');
    const serviceName = getServiceNameFromEvent(event, data);
    
    sendBizEvent(eventType, {
      ...data,
      telemetryEvent: event,
      timestamp,
      service: serviceName
    });
  }
  
  // No SDK metrics; BizEvents come from request body capture on /api/* endpoints
  
  // Update metrics
  gameMetrics.totalSpins += data.action === 'spin' ? 1 : 0;
  gameMetrics.totalWins += data.win ? 1 : 0;
  gameMetrics.totalLosses += !data.win && data.action === 'spin' ? 1 : 0;
  gameMetrics.totalRevenue += data.betAmount || 0;
  gameMetrics.totalPayout += data.winAmount || 0;
  
  if (data.game) {
    gameMetrics.gamesPlayed[data.game.toLowerCase()] = (gameMetrics.gamesPlayed[data.game.toLowerCase()] || 0) + 1;
  }
  
  if (data.error) {
    gameMetrics.errors.push({
      timestamp,
      error: data.error,
      correlationId: data.correlationId
    });
    
    // Keep only last 100 errors
    if (gameMetrics.errors.length > 100) {
      gameMetrics.errors = gameMetrics.errors.slice(-100);
    }
  }
}

// Helper function to get service hostname in K8s
function getServiceHostname(port) {
  // If running in Kubernetes, use service DNS names
  if (process.env.KUBERNETES_SERVICE_HOST) {
    const serviceMap = {
      8081: 'vegas-slots-service',
      8082: 'vegas-roulette-service',
      8083: 'vegas-dice-service',
      8084: 'vegas-blackjack-service'
    };
    return serviceMap[port] || '127.0.0.1';
  }
  
  // If service URLs are provided via env vars, extract hostname
  const urlMap = {
    8081: process.env.SLOTS_SERVICE_URL,
    8082: process.env.ROULETTE_SERVICE_URL,
    8083: process.env.DICE_SERVICE_URL,
    8084: process.env.BLACKJACK_SERVICE_URL
  };
  
  const url = urlMap[port];
  if (url) {
    try {
      return new URL(url).hostname;
    } catch (e) {
      // If URL parsing fails, assume it's already a hostname
      return url.replace(/^https?:\/\//, '').split(':')[0];
    }
  }
  
  return '127.0.0.1';
}

// Helper function to determine service name from event
function getServiceNameFromEvent(event, data) {
  if (event.includes('SLOTS') || data.game === 'Slots') return SERVICE_NAMES.slots;
  if (event.includes('ROULETTE') || data.game === 'Roulette') return SERVICE_NAMES.roulette;
  if (event.includes('DICE') || data.game === 'Dice') return SERVICE_NAMES.dice;
  if (event.includes('BLACKJACK') || data.game === 'Blackjack') return SERVICE_NAMES.blackjack;
  if (event.includes('LEADERBOARD')) return SERVICE_NAMES.leaderboard;
  if (event.includes('METRICS')) return SERVICE_NAMES.analytics;
  return SERVICE_NAMES.casino;
}

// OpenTelemetry middleware for service identification
function openTelemetryMiddleware(serviceName) {
  return (req, res, next) => {
    const { trace, context } = require('@opentelemetry/api');
    const tracer = trace.getTracer(serviceName);
    const span = tracer.startSpan(`${req.method} ${req.path}`);
    
    // Set semantic convention attributes
    span.setAttributes({
      'service.name': serviceName,
      'http.method': req.method,
      'http.route': req.path,
      'http.target': req.url,
      'http.scheme': req.protocol,
      'http.user_agent': req.get('user-agent') || '',
    });

    // Set game attributes based on service
    const gameMap = {
      'vegas-slots-service': { category: 'slot-machines', type: 'slots-machine' },
      'vegas-roulette-service': { category: 'table-games', type: 'european-roulette' },
      'vegas-dice-service': { category: 'dice-games', type: 'craps-dice' },
      'vegas-blackjack-service': { category: 'card-games', type: 'blackjack-21' },
    };
    
    const gameInfo = gameMap[serviceName];
    if (gameInfo) {
      span.setAttribute('game.category', gameInfo.category);
      span.setAttribute('game.type', gameInfo.type);
    }

    // Store span in request context
    const ctx = trace.setSpan(context.active(), span);
    context.with(ctx, () => {
      req.span = span;
      req.serviceName = serviceName;
      next();
    });

    // End span when response finishes
    res.on('finish', () => {
      span.setAttribute('http.status_code', res.statusCode);
      span.end();
    });
  };
}

// Simulate system metrics
function simulateSystemMetrics() {
  gameMetrics.systemHealth.cpu = Math.floor(Math.random() * 100);
  gameMetrics.systemHealth.memory = Math.floor(Math.random() * 100);
  gameMetrics.systemHealth.latency = Math.floor(Math.random() * 200) + 50;
  gameMetrics.systemHealth.uptime = process.uptime();
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  gameMetrics.activeUsers++;
  
  // Send initial metrics
  socket.emit('metrics-update', gameMetrics);
  
  // Handle user session tracking
  socket.on('user-login', (userData) => {
    userSessions.set(socket.id, {
      username: userData.username,
      loginTime: Date.now(),
      gamesPlayed: 0,
      totalWagered: 0
    });
    
    logTelemetry('USER_LOGIN', {
      username: userData.username,
      socketId: socket.id,
      correlationId: generateCorrelationId()
    });
  });
  
  // Handle game events
  socket.on('game-action', (gameData) => {
    const correlationId = generateCorrelationId();
    const session = userSessions.get(socket.id);
    
    if (session) {
      session.gamesPlayed++;
      session.totalWagered += gameData.betAmount || 0;
    }
    
    logTelemetry('GAME_ACTION', {
      ...gameData,
      socketId: socket.id,
      username: session?.username || 'Anonymous',
      correlationId
    });
    
    // Broadcast metrics update to all connected clients
    io.emit('metrics-update', gameMetrics);
  });
  
  // Handle slots spin events
  socket.on('slots-spin', async (data) => {
    try {
      const { betAmount, username } = data;
      const correlationId = generateCorrelationId();
      
      // Call the slots API logic
      const slotsResult = await spinSlots(betAmount);
      
      // Update session data
      let session = userSessions.get(socket.id);
      if (!session) {
        session = {
          username: username || 'Anonymous',
          balance: 1000,
          gamesPlayed: 0,
          totalWagered: 0
        };
        userSessions.set(socket.id, session);
      }
      
      // Update session with spin results
      session.gamesPlayed++;
      session.totalWagered += betAmount;
      session.balance += (slotsResult.winAmount - betAmount); // Add winnings, subtract bet
      
      // Ensure balance doesn't go negative
      if (session.balance < 0) session.balance = 0;
      
      // Log telemetry
      logTelemetry('SLOTS_SPIN', {
        betAmount,
        result: slotsResult.result,
        win: slotsResult.win,
        winAmount: slotsResult.winAmount,
        socketId: socket.id,
        username: session.username,
        correlationId
      });
      
      // Send result back to the client with consistent field names
      socket.emit('slots-result', {
        symbols: slotsResult.result,
        result: slotsResult.result,
        multiplier: slotsResult.multiplier,
        winAmount: slotsResult.winAmount,
        winnings: slotsResult.winAmount, // Keep both for compatibility
        betAmount: betAmount,
        newBalance: session.balance,
        correlationId: correlationId
      });
      
      // Update global metrics
      gameMetrics.totalWagers += betAmount;
      if (slotsResult.win) {
        gameMetrics.totalPayouts += slotsResult.winAmount;
      }
      
      // Broadcast metrics update
      io.emit('metrics-update', gameMetrics);
      
    } catch (error) {
      console.error('Slots spin error:', error);
      socket.emit('slots-error', { message: 'Spin failed. Please try again.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    gameMetrics.activeUsers = Math.max(0, gameMetrics.activeUsers - 1);
    
    const session = userSessions.get(socket.id);
    if (session) {
      const sessionTime = (Date.now() - session.loginTime) / 1000 / 60; // minutes
      gameMetrics.averageSessionTime = (gameMetrics.averageSessionTime + sessionTime) / 2;
      
      logTelemetry('USER_LOGOUT', {
        username: session.username,
        sessionTime,
        gamesPlayed: session.gamesPlayed,
        totalWagered: session.totalWagered,
        correlationId: generateCorrelationId()
      });
      
      userSessions.delete(socket.id);
    }
    
    io.emit('metrics-update', gameMetrics);
  });
});

// API Routes

/**
 * Metrics endpoint - Returns comprehensive telemetry data
 */
app.get('/api/metrics', openTelemetryMiddleware(SERVICE_NAMES.analytics), (req, res) => {
  simulateSystemMetrics();
  
  const metricsData = {
    ...gameMetrics,
    timestamp: new Date().toISOString(),
    correlationId: generateCorrelationId()
  };
  
  res.json(metricsData);
});

/**
 * BizEvent capture endpoint - accepts completed game events with resolved outcomes
 * OneAgent can capture this request body as Business Events with full fields.
 */
app.post('/api/bizevent', openTelemetryMiddleware(SERVICE_NAMES.analytics), (req, res) => {
  try {
    const payload = req.body || {};
    // Log minimal telemetry and forward as BizEvent structure for visibility
    logTelemetry('BIZEVENT_COMPLETED', {
      action: payload.Action || 'Completed',
      game: payload.Game || 'Vegas',
      username: payload.Username || 'Anonymous',
      correlationId: payload.CorrelationId,
      win: Boolean(payload.WinFlag),
      winAmount: Number(payload.WinningAmount || 0),
      lossAmount: Number(payload.LossAmount || 0)
    });
  } catch (e) {
    // ignore errors; this is best-effort
  }
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

/**
 * Metrics Route (Alternative endpoint for lobby compatibility)
 */
app.get('/metrics', openTelemetryMiddleware(SERVICE_NAMES.analytics), (req, res) => {
  simulateSystemMetrics();
  
  const metricsData = {
    ...gameMetrics,
    timestamp: new Date().toISOString(),
    correlationId: generateCorrelationId()
  };
  
  res.json(metricsData);
});

/**
 * Slots API - Receives bizevent payload directly in request body for OneAgent capture
 */
// Proxy: Slots
app.post('/api/slots/spin', openTelemetryMiddleware(SERVICE_NAMES.slots), async (req, res) => {
  try {
    startChildService(SERVICE_NAMES.slots, path.join(__dirname, '..', 'slots', 'index.js'));
    const Username = (req.body && (req.body.Username || req.body.userId || req.body.username)) || 'Anonymous';
    const BetAmount = Number((req.body && (req.body.BetAmount ?? req.body.betAmount)) || 10);
    
    // Extract cheating information
    const CheatActive = req.body.CheatActive || false;
    const CheatType = req.body.CheatType || null;
    const CheatDetails = req.body.CheatDetails || null;
    
    const user = getOrCreateUser(Username);
    const balanceBefore = user.balance;
    
    if (user.balance < BetAmount) return res.status(400).json({ error: 'Insufficient balance', balance: user.balance });
    
    // Deduct bet
    updateUserBalance(Username, -BetAmount);
    const payload = { ...req.body, Username, BetAmount, Balance: users.get(Username).balance };
    const data = await callChildJson(SERVICE_PORTS[SERVICE_NAMES.slots], '/spin', payload);
    
    let winAmount = Number(data.winAmount || 0);
    let originalWinAmount = winAmount;
    let cheatApplied = false;
    
    // Apply cheating boost if active
    if (CheatActive && CheatDetails && winAmount > 0) {
      const winBoost = CheatDetails.winBoost || 0;
      winAmount = Math.floor(winAmount * (1 + winBoost));
      cheatApplied = true;
      
      console.log(`[CHEAT-BOOST] ${CheatType}: Original win $${originalWinAmount} -> Boosted to $${winAmount} (+${Math.round(winBoost * 100)}%)`);
      
      // Update the response data to reflect the cheated win
      data.winAmount = winAmount;
      data.cheatApplied = true;
      data.originalWinAmount = originalWinAmount;
      data.winBoost = winBoost;
    }
    
    if (winAmount > 0) updateUserBalance(Username, winAmount);
    
    const balanceAfter = users.get(Username).balance;
    
    // Log comprehensive game activity
    await logGameActivity('slots', 'spin', {
      customerName: req.body.CustomerName,
      Username: Username,
      email: req.body.Email,
      companyName: req.body.CompanyName,
      persona: req.body.Persona,
      booth: req.body.Booth,
      optIn: req.body.OptIn
    }, {
      betAmount: BetAmount,
      winAmount: winAmount,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      result: data.result,
      multiplier: data.multiplier,
      cheatActive: CheatActive,
      cheatType: CheatType,
      cheatApplied: cheatApplied,
      originalWinAmount: originalWinAmount,
      correlationId: req.body.CorrelationId
    });
    
    // Automatic lockout on high-risk cheating patterns
    if (CheatActive && cheatApplied && winAmount > 2000) {
      const riskScore = (req.body.DetectionRisk || 0) + (req.body.CheatActivationsToday || 0) * 5;
      
      if (riskScore > 50) {
        userLockouts.set(Username, {
          locked: true,
          reason: `High-risk cheating detected (Risk: ${riskScore})`,
          timestamp: new Date().toISOString(),
          duration: 30 // 30 minute lockout
        });
        
        console.log(`🚨 [AUTO-LOCKOUT] User ${Username} automatically locked for high-risk cheating (Risk: ${riskScore})`);
      }
    }
    
    // Include complete analytics data in response body for OneAgent capture
    res.json({ 
      ...data, 
      newBalance: users.get(Username).balance, 
      Username,
      // Complete user profile data
      CustomerName: req.body.CustomerName,
      Email: req.body.Email,
      CompanyName: req.body.CompanyName,
      Persona: req.body.Persona,
      Booth: req.body.Booth,
      OptIn: req.body.OptIn,
      // Game analytics data
      Game: 'Vegas Slots Machine',
      BetAmount: BetAmount,
      WinFlag: winAmount > 0 ? 1 : 0,
      WinningAmount: winAmount,
      LossAmount: winAmount > 0 ? 0 : BetAmount,
      Balance: users.get(Username).balance,
      Action: 'SpinCompleted',
      Device: 'Browser-UI',
      CorrelationId: req.body.CorrelationId,
      Status: 'Completed',
      // Cheat detection data
      CheatActive: CheatActive,
      CheatType: CheatType,
      CheatDetails: CheatDetails,
      DetectionRisk: req.body.DetectionRisk,
      CheatActivationsToday: req.body.CheatActivationsToday,
      // Jackpot detection (wins >= $1000)
      JackpotFlag: winAmount >= 1000 ? 1 : 0
    });
  } catch (e) {
    res.status(502).json({ error: 'Service unavailable', details: e.message });
  }
});

/**
 * Roulette API - Receives bizevent payload directly in request body for OneAgent capture
 */
// Proxy: Roulette
app.post('/api/roulette/spin', openTelemetryMiddleware(SERVICE_NAMES.roulette), async (req, res) => {
  try {
    startChildService(SERVICE_NAMES.roulette, path.join(__dirname, '..', 'roulette', 'index.js'));
    const Username = (req.body && (req.body.Username || req.body.userId || req.body.username)) || 'Anonymous';
    const BetAmount = Number((req.body && (req.body.BetAmount ?? req.body.betAmount)) || 10);
    const user = getOrCreateUser(Username);
    const balanceBefore = user.balance;
    
    if (user.balance < BetAmount) return res.status(400).json({ error: 'Insufficient balance', balance: user.balance });
    updateUserBalance(Username, -BetAmount);
    const payload = { ...req.body, Username, BetAmount, Balance: users.get(Username).balance };
    const data = await callChildJson(SERVICE_PORTS[SERVICE_NAMES.roulette], '/spin', payload);
    const payout = Number(data.payout || 0);
    if (payout > 0) updateUserBalance(Username, payout);
    
    const balanceAfter = users.get(Username).balance;
    const CheatActive = req.body.CheatActive === true;
    const CheatType = req.body.CheatType || null;
    const CheatDetails = req.body.CheatDetails || null;
    
    // Log roulette activity with enhanced cheat detection
    await logGameActivity('roulette', 'spin', {
      customerName: req.body.CustomerName,
      Username: Username,
      email: req.body.Email,
      companyName: req.body.CompanyName,
      persona: req.body.Persona,
      booth: req.body.Booth,
      optIn: req.body.OptIn,
      cheatDetails: CheatDetails
    }, {
      betAmount: BetAmount,
      winAmount: payout,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      result: data.result || data.number,
      multiplier: data.multiplier || 0,
      cheatActive: CheatActive,
      cheatType: CheatType,
      correlationId: req.body.CorrelationId
    });
    
    // Include complete analytics data in response body for OneAgent capture
    res.json({ 
      ...data, 
      newBalance: users.get(Username).balance, 
      Username,
      // Complete user profile data
      CustomerName: req.body.CustomerName,
      Email: req.body.Email,
      CompanyName: req.body.CompanyName,
      Persona: req.body.Persona,
      Booth: req.body.Booth,
      OptIn: req.body.OptIn,
      // Game analytics data
      Game: 'Vegas Roulette',
      BetAmount: BetAmount,
      WinFlag: payout > 0 ? 1 : 0,
      WinningAmount: payout,
      LossAmount: payout > 0 ? 0 : BetAmount,
      Balance: users.get(Username).balance,
      Action: 'SpinCompleted',
      Device: 'Browser-UI',
      CorrelationId: req.body.CorrelationId,
      Status: 'Completed',
      // Game-specific data
      BetType: req.body.BetType,
      BetValue: req.body.BetValue
    });
  } catch (e) {
    res.status(502).json({ error: 'Service unavailable', details: e.message });
  }
});

/**
 * Dice API - Receives bizevent payload directly in request body for OneAgent capture
 */
// Proxy: Dice
app.post('/api/dice/roll', openTelemetryMiddleware(SERVICE_NAMES.dice), async (req, res) => {
  try {
    startChildService(SERVICE_NAMES.dice, path.join(__dirname, '..', 'dice', 'go', 'dice-service-grpc'));
    const Username = (req.body && (req.body.Username || req.body.userId || req.body.username)) || 'Anonymous';
    const BetAmount = Number((req.body && (req.body.BetAmount ?? req.body.betAmount)) || 10);
    const user = getOrCreateUser(Username);
    const balanceBefore = user.balance;
    
    if (user.balance < BetAmount) return res.status(400).json({ error: 'Insufficient balance', balance: user.balance });
    updateUserBalance(Username, -BetAmount);
    const payload = { ...req.body, Username, BetAmount, Balance: users.get(Username).balance };
    const data = await callChildJson(SERVICE_PORTS[SERVICE_NAMES.dice], '/roll', payload);
    
    // Use cheat payout if provided (client-side cheat system override)
    const cheatPayout = Number(req.body.CheatPayout || 0);
    const payout = cheatPayout > 0 ? cheatPayout : Number(data.payout || 0);
    
    if (payout > 0) updateUserBalance(Username, payout);
    
    console.log(`🎲 Dice payout: server=${data.payout}, cheat=${cheatPayout}, final=${payout}`);
    
    const balanceAfter = users.get(Username).balance;
    
    const CheatActive = req.body.CheatActive === true;
    const CheatType = req.body.CheatType || null;
    const CheatDetails = req.body.CheatDetails || null;
    
    // Log dice activity with enhanced cheat detection
    await logGameActivity('dice', 'roll', {
      customerName: req.body.CustomerName,
      Username: Username,
      email: req.body.Email,
      companyName: req.body.CompanyName,
      persona: req.body.Persona,
      booth: req.body.Booth,
      optIn: req.body.OptIn,
      cheatDetails: CheatDetails
    }, {
      betAmount: BetAmount,
      winAmount: payout,
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      result: data.result || data.dice,
      multiplier: data.multiplier || 0,
      cheatActive: CheatActive,
      cheatType: CheatType,
      correlationId: req.body.CorrelationId
    }, req);
    
    // Include complete analytics data in response body for OneAgent capture
    res.json({ 
      ...data, 
      newBalance: users.get(Username).balance, 
      Username,
      // Complete user profile data
      CustomerName: req.body.CustomerName,
      Email: req.body.Email,
      CompanyName: req.body.CompanyName,
      Persona: req.body.Persona,
      Booth: req.body.Booth,
      OptIn: req.body.OptIn,
      // Game analytics data
      Game: 'Vegas Dice',
      BetAmount: BetAmount,
      WinFlag: payout > 0 ? 1 : 0,
      WinningAmount: payout,
      LossAmount: payout > 0 ? 0 : BetAmount,
      Balance: users.get(Username).balance,
      Action: 'RollCompleted',
      Device: 'Browser-UI',
      CorrelationId: req.body.CorrelationId,
      Status: 'Completed',
      // Game-specific data
      BetType: req.body.BetType
    });
  } catch (e) {
    res.status(502).json({ error: 'Service unavailable', details: e.message });
  }
});

/**
 * Blackjack API - Receives bizevent payload directly in request body for OneAgent capture
 */
// Proxy: Blackjack
app.post('/api/blackjack/deal', openTelemetryMiddleware(SERVICE_NAMES.blackjack), async (req, res) => {
  try {
    startChildService(SERVICE_NAMES.blackjack, path.join(__dirname, '..', 'blackjack', 'index.js'));
    const Username = (req.body && (req.body.Username || req.body.userId || req.body.username)) || 'Anonymous';
    const BetAmount = Number((req.body && req.body.BetAmount) || 10);
    const user = getOrCreateUser(Username);
    const balanceBefore = user.balance;
    
    if (user.balance < BetAmount) return res.status(400).json({ error: 'Insufficient balance', balance: user.balance });
    updateUserBalance(Username, -BetAmount);
    const payload = { ...req.body, Username, BetAmount, Balance: users.get(Username).balance };
    const data = await callChildJson(SERVICE_PORTS[SERVICE_NAMES.blackjack], '/deal', payload);
    
    const balanceAfter = users.get(Username).balance;
    
    const CheatActive = req.body.CheatActive === true;
    const CheatType = req.body.CheatType || null;
    const CheatDetails = req.body.CheatDetails || null;
    
    // Log blackjack deal activity with enhanced cheat detection
    await logGameActivity('blackjack', 'deal', {
      customerName: req.body.CustomerName,
      Username: Username,
      email: req.body.Email,
      companyName: req.body.CompanyName,
      persona: req.body.Persona,
      booth: req.body.Booth,
      optIn: req.body.OptIn,
      cheatDetails: CheatDetails
    }, {
      betAmount: BetAmount,
      winAmount: 0, // No payout on deal
      balanceBefore: balanceBefore,
      balanceAfter: balanceAfter,
      result: data.playerCards || 'cards dealt',
      multiplier: 0,
      cheatActive: CheatActive,
      cheatType: CheatType,
      correlationId: req.body.CorrelationId
    }, req);
    
    // For now, no automatic payout on deal; following actions (not yet proxied) would adjust
    res.json({ ...data, newBalance: users.get(Username).balance, Username });
  } catch (e) {
    res.status(502).json({ error: 'Service unavailable', details: e.message });
  }
});

// Game state storage for blackjack (in production, use Redis or database)
const blackjackGames = new Map();

// Blackjack helper functions
function calculateBlackjackScore(hand) {
  let score = 0;
  let aces = 0;
  
  for (let card of hand) {
    const value = parseInt(card.value);
    if (value === 1) {
      aces++;
      score += 11;
    } else if (value > 10) {
      score += 10;
    } else {
      score += value;
    }
  }
  
  // Adjust for aces
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  
  return score;
}

/**
 * Blackjack Hit API - Player takes additional card
 */
app.post('/api/blackjack/hit', openTelemetryMiddleware(SERVICE_NAMES.blackjack), (req, res) => {
  startChildService(SERVICE_NAMES.blackjack, path.join(__dirname, '..', 'blackjack', 'index.js'));
  proxyJson(SERVICE_PORTS[SERVICE_NAMES.blackjack], req, res);
});

/**
 * Blackjack Stand API - Player stands, dealer plays
 */
app.post('/api/blackjack/stand', openTelemetryMiddleware(SERVICE_NAMES.blackjack), (req, res) => {
  startChildService(SERVICE_NAMES.blackjack, path.join(__dirname, '..', 'blackjack', 'index.js'));
  // Proxy then adjust balance based on result
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const Username = (payload && (payload.Username || payload.username)) || 'Anonymous';
      const data = await callChildJson(SERVICE_PORTS[SERVICE_NAMES.blackjack], '/stand', payload);
      const payout = Number(data.payout || 0);
      if (payout > 0) updateUserBalance(Username, payout);
      
      // Include complete analytics data in response body for OneAgent capture
      res.json({ 
        ...data, 
        newBalance: users.get(Username).balance, 
        Username,
        // Complete user profile data
        CustomerName: payload.CustomerName,
        Email: payload.Email,
        CompanyName: payload.CompanyName,
        Persona: payload.Persona,
        Booth: payload.Booth,
        OptIn: payload.OptIn,
        // Game analytics data
        Game: 'Vegas Blackjack',
        BetAmount: payload.BetAmount,
        WinFlag: payout > 0 ? 1 : 0,
        WinningAmount: payout,
        LossAmount: (data.result === 'win' || data.result === 'blackjack') ? 0 : (data.result === 'push' ? 0 : payload.BetAmount),
        Balance: users.get(Username).balance,
        Action: 'HandCompleted',
        Device: 'Browser-UI',
        CorrelationId: payload.CorrelationId,
        Status: 'Completed',
        // Game-specific data
        HandType: data.result || 'unknown'
      });
    } catch (e) {
      res.status(502).json({ error: 'Service unavailable', details: e.message });
    }
  });
});

/**
 * Blackjack Double API - Player doubles down
 */
app.post('/api/blackjack/double', openTelemetryMiddleware(SERVICE_NAMES.blackjack), (req, res) => {
  startChildService(SERVICE_NAMES.blackjack, path.join(__dirname, '..', 'blackjack', 'index.js'));
  // Proxy then deduct additional bet and return updated balance
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const Username = (payload && (payload.Username || payload.username)) || 'Anonymous';
      const data = await callChildJson(SERVICE_PORTS[SERVICE_NAMES.blackjack], '/double', payload);
      const additional = Number(data.additionalBet || 0);
      if (additional > 0) {
        const user = getOrCreateUser(Username);
        if (user.balance < additional) {
          return res.status(400).json({ error: 'Insufficient balance to double', balance: user.balance });
        }
        updateUserBalance(Username, -additional);
      }
      res.json({ ...data, newBalance: users.get(Username).balance, Username });
    } catch (e) {
      res.status(502).json({ error: 'Service unavailable', details: e.message });
    }
  });
});

/**
 * Leaderboard API - Returns top players
 */
app.get('/api/leaderboard', openTelemetryMiddleware(SERVICE_NAMES.leaderboard), (req, res) => {
  const correlationId = generateCorrelationId();
  
  // Simulate leaderboard data
  const leaderboard = [
    { username: 'DynaTrader', totalWins: 1250, totalWagered: 15000, winRate: 0.83 },
    { username: 'ObservabilityKing', totalWins: 980, totalWagered: 12500, winRate: 0.78 },
    { username: 'MetricMaster', totalWins: 875, totalWagered: 11200, winRate: 0.78 },
    { username: 'TelemetryPro', totalWins: 750, totalWagered: 9800, winRate: 0.77 },
    { username: 'TracingExpert', totalWins: 720, totalWagered: 9500, winRate: 0.76 },
    { username: 'MonitoringGuru', totalWins: 650, totalWagered: 8900, winRate: 0.73 },
    { username: 'APMSpecialist', totalWins: 580, totalWagered: 8100, winRate: 0.72 },
    { username: 'SmartscapeNavigator', totalWins: 520, totalWagered: 7300, winRate: 0.71 },
    { username: 'CloudObserver', totalWins: 480, totalWagered: 6800, winRate: 0.71 },
    { username: 'PerformanceTracker', totalWins: 420, totalWagered: 6200, winRate: 0.68 }
  ];
  
  logTelemetry('LEADERBOARD_REQUEST', {
    action: 'get_leaderboard',
    correlationId
  });
  
  res.json({
    leaderboard,
    correlationId,
    timestamp: new Date().toISOString()
  });
});

/**
 * Slots Test Payout API - For testing specific symbol combinations
 */
app.post('/api/slots/test-payout', openTelemetryMiddleware(SERVICE_NAMES.slots), (req, res) => {
  const { symbols, betAmount } = req.body;
  const actualBetAmount = betAmount || 10;
  const correlationId = generateCorrelationId();
  
  try {
    // Calculate win based on provided symbols
    const uniqueIcons = [...new Set(symbols)];
    const isWin = uniqueIcons.length === 1 || uniqueIcons.length === 2;
    
    let multiplier = 0;
    if (uniqueIcons.length === 1) {
      // All three symbols match
      const symbol = uniqueIcons[0];
      if (symbol === 'dynatrace') {
        multiplier = 50; // Special Dynatrace jackpot
      } else if (symbol === 'diamond') {
        multiplier = 20;
      } else if (symbol === 'seven') {
        multiplier = 10;
      } else if (symbol === 'cherry') {
        multiplier = 5;
      } else {
        multiplier = 3;
      }
    } else if (uniqueIcons.length === 2) {
      // Two matching symbols
      multiplier = 2;
    }
    
    const winAmount = isWin ? actualBetAmount * multiplier : 0;
    
    const responseData = {
      symbols,
      win: isWin,
      winAmount,
      betAmount: actualBetAmount,
      multiplier: isWin ? multiplier : 0,
      correlationId,
      timestamp: new Date().toISOString()
    };
    
    logTelemetry('SLOTS_TEST_PAYOUT', {
      game: 'Vegas Slots',
      action: 'test-payout',
      symbols,
      betAmount: actualBetAmount,
      win: isWin,
      winAmount,
      multiplier,
      correlationId
    });
    
    res.json(responseData);
    
  } catch (error) {
    const errorData = {
      error: 'SLOTS_TEST_ERROR',
      message: error.message,
      correlationId,
      timestamp: new Date().toISOString()
    };
    
    logTelemetry('ERROR', {
      game: 'Vegas Slots',
      action: 'test-payout',
      error: error.message,
      correlationId
    });
    
    res.status(500).json(errorData);
  }
});

/**
 * Health check endpoint - Returns server status
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Start periodic metrics simulation
setInterval(() => {
  simulateSystemMetrics();
  io.emit('metrics-update', gameMetrics);
}, 5000); // Update every 5 seconds

// Error handling middleware
app.use((err, req, res, next) => {
  const correlationId = generateCorrelationId();
  
  logTelemetry('SERVER_ERROR', {
    error: err.message,
    stack: err.stack,
    correlationId
  });
  
  res.status(500).json({
    error: 'Internal Server Error',
    correlationId,
    timestamp: new Date().toISOString()
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎰 Dynatrace Vegas Casino Server running on http://0.0.0.0:${PORT}`);
  console.log(`📊 Metrics available at http://0.0.0.0:${PORT}/metrics`);
  console.log(`🌐 External access available at http://3.85.230.103:${PORT}`);
  console.log(`🔌 WebSocket server ready for real-time updates`);
  // Pre-start game services to improve first-request experience
  startChildService(SERVICE_NAMES.slots, path.join(__dirname, '..', 'slots', 'index.js'));
  startChildService(SERVICE_NAMES.roulette, path.join(__dirname, '..', 'roulette', 'index.js'));
  startChildService(SERVICE_NAMES.dice, path.join(__dirname, '..', 'dice', 'go', 'dice-service-grpc'));
  startChildService(SERVICE_NAMES.blackjack, path.join(__dirname, '..', 'blackjack', 'index.js'));
});

/**
 * Remote Lockout System - Dynatrace can trigger user lockouts
 */
// In-memory lockout store (in production, use Redis or database)
const userLockouts = new Map(); // key: Username, value: { locked: boolean, reason: string, timestamp: string, duration: number }

// CORS is already handled globally at the top of the file

// Endpoint for Dynatrace to trigger lockouts via API
app.post('/api/admin/lockout-user', (req, res) => {
  const { Username, Reason, Duration = 0 } = req.body;
  
  if (!Username) {
    return res.status(400).json({ error: 'Username required' });
  }
  
  userLockouts.set(Username, {
    locked: true,
    reason: Reason || 'Security violation detected',
    timestamp: new Date().toISOString(),
    duration: Duration // minutes, 0 = indefinite
  });
  
  console.log(`🚫 [LOCKOUT] User ${Username} locked: ${Reason}`);
  
  res.json({ 
    success: true, 
    message: `User ${Username} has been locked out`,
    lockout: userLockouts.get(Username)
  });
});

// Enhanced endpoint for Dynatrace workflows with DQL query results
app.post('/api/admin/lockout-user-cheat', (req, res) => {
  try {
    console.log('📥 Final parsed body:', JSON.stringify(req.body, null, 2));
    console.log('📥 Body type:', typeof req.body);
    
    // Handle multiple possible formats from Dynatrace workflows
    let cheatRecords;
    
    if (Array.isArray(req.body)) {
      // Direct array format
      cheatRecords = req.body;
    } else if (req.body && req.body.cheatRecords) {
      // Wrapped in cheatRecords object
      if (typeof req.body.cheatRecords === 'object' && req.body.cheatRecords.records) {
        // cheatRecords.records format (from Dynatrace)
        cheatRecords = req.body.cheatRecords.records;
      } else if (Array.isArray(req.body.cheatRecords)) {
        // Direct array in cheatRecords
        cheatRecords = req.body.cheatRecords;
      }
    } else if (req.body && Array.isArray(req.body.records)) {
      // Direct records array
      cheatRecords = req.body.records;
    } else if (req.body && req.body.records) {
      // Object with records
      cheatRecords = req.body.records;
    } else {
      return res.status(400).json({ 
        error: 'Invalid request format. Could not find cheat records.',
        receivedType: typeof req.body,
        receivedKeys: req.body ? Object.keys(req.body) : 'none',
        hint: 'Expected array or object with cheatRecords/records property'
      });
    }
    
    if (!Array.isArray(cheatRecords) || cheatRecords.length === 0) {
      return res.status(400).json({ 
        error: 'cheatRecords must be a non-empty array',
        received: cheatRecords,
        receivedType: typeof cheatRecords
      });
    }
    
    const results = [];
    
    // Process each cheat record from DQL query
    cheatRecords.forEach((record, index) => {
      const username = record['json.customer_name'] || record.username;
      const cheatType = record['json.cheat_type'] || record.cheat_type;
      const winAmount = parseFloat(record['json.win_amount'] || record.win_amount || 0);
      
      if (!username) {
        results.push({ index, error: 'Missing username', record });
        return;
      }
      
      // Calculate total cheat winnings for this user
      const userCheats = cheatRecords.filter(r => 
        (r['json.customer_name'] || r.username) === username
      );
      const totalCheatWinnings = userCheats.reduce((sum, r) => 
        sum + parseFloat(r['json.win_amount'] || r.win_amount || 0), 0
      );
      
      // Deduct cheat winnings from user balance
      const user = getOrCreateUser(username);
      const balanceBefore = user.balance;
      updateUserBalance(username, -totalCheatWinnings);
      const balanceAfter = users.get(username).balance;
      
      // Lock the user
      const reason = `Cheat detected: ${cheatType.toUpperCase()} (${userCheats.length} violations, $${totalCheatWinnings} confiscated)`;
      userLockouts.set(username, {
        locked: true,
        reason: reason,
        timestamp: new Date().toISOString(),
        duration: 60, // 1 hour lockout for cheating
        cheatData: {
          totalViolations: userCheats.length,
          totalWinningsConfiscated: totalCheatWinnings,
          cheatTypes: [...new Set(userCheats.map(r => r['json.cheat_type'] || r.cheat_type))],
          detectedAt: new Date().toISOString()
        }
      });
      
      console.log(`🚨 [CHEAT-LOCKOUT] User ${username}: ${userCheats.length} violations, $${totalCheatWinnings} confiscated, balance ${balanceBefore} → ${balanceAfter}`);
      
      results.push({
        index,
        username,
        success: true,
        action: 'locked_and_balance_adjusted',
        cheatViolations: userCheats.length,
        totalWinningsConfiscated: totalCheatWinnings,
        balanceBefore,
        balanceAfter,
        lockReason: reason
      });
    });
    
    // Group results by username to avoid duplicates
    const uniqueResults = results.reduce((acc, result) => {
      if (result.username && !acc.find(r => r.username === result.username)) {
        acc.push(result);
      } else if (!result.username) {
        acc.push(result); // Include errors
      }
      return acc;
    }, []);
    
    res.json({
      success: true,
      message: `Processed ${cheatRecords.length} cheat records for ${uniqueResults.filter(r => r.success).length} unique users`,
      results: uniqueResults,
      summary: {
        totalRecordsProcessed: cheatRecords.length,
        uniqueUsersLocked: uniqueResults.filter(r => r.success).length,
        totalWinningsConfiscated: uniqueResults.reduce((sum, r) => sum + (r.totalWinningsConfiscated || 0), 0)
      }
    });
    
  } catch (error) {
    console.error('❌ Error processing cheat lockout:', error);
    res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
});

// Endpoint for Dynatrace to release lockouts
app.post('/api/admin/unlock-user', (req, res) => {
  const { Username } = req.body;
  
  if (!Username) {
    return res.status(400).json({ error: 'Username required' });
  }
  
  userLockouts.delete(Username);
  console.log(`✅ [UNLOCK] User ${Username} lockout released`);
  
  res.json({ success: true, message: `User ${Username} has been unlocked` });
});

// Client-side lockout status check
app.post('/api/user/lockout-check', (req, res) => {
  const { Username } = req.body;
  const lockoutData = userLockouts.get(Username);
  
  if (!lockoutData || !lockoutData.locked) {
    return res.json({ lockoutRequired: false });
  }
  
  // Check if timed lockout has expired
  if (lockoutData.duration > 0) {
    const lockTime = new Date(lockoutData.timestamp);
    const expiryTime = new Date(lockTime.getTime() + (lockoutData.duration * 60000));
    
    if (new Date() > expiryTime) {
      userLockouts.delete(Username);
      return res.json({ lockoutRequired: false });
    }
  }
  
  res.json({
    lockoutRequired: true,
    reason: lockoutData.reason,
    timestamp: lockoutData.timestamp,
    duration: lockoutData.duration,
    // Include detailed cheat data if available
    cheatData: lockoutData.cheatData || null
  });
});

// Lockout confirmation tracking
app.post('/api/user/lockout-confirmed', (req, res) => {
  // Log that user received lockout notification
  console.log(`📋 [LOCKOUT-CONFIRMED] User: ${req.body.Username}, Reason: ${req.body.LockoutReason}`);
  res.json({ received: true });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT, shutting down gracefully...');
  server.close(() => {
    console.log('👋 Server closed');
    process.exit(0);
  });
});