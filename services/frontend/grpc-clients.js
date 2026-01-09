/**
 * gRPC Client Factory
 * Creates gRPC clients for all game services
 */

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { trace, context, propagation } = require('@opentelemetry/api');

// Load proto files
const PROTO_PATH = {
  slots: './proto/slots.proto',
  roulette: './proto/roulette.proto',
  dice: './proto/dice.proto',
  blackjack: './proto/blackjack.proto',
  dashboard: './proto/dashboard.proto'
};

function loadProto(protoPath) {
  const path = require('path');
  const packageDefinition = protoLoader.loadSync(
    path.join(__dirname, protoPath),
    {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true
    }
  );
  return grpc.loadPackageDefinition(packageDefinition);
}

function createClient() {
  const path = require('path');
  
  // Service endpoints (from environment or defaults)
  const endpoints = {
    slots: process.env.SLOTS_SERVICE_GRPC || 'localhost:50051',
    roulette: process.env.ROULETTE_SERVICE_GRPC || 'localhost:50052',
    dice: process.env.DICE_SERVICE_GRPC || 'localhost:50053',
    blackjack: process.env.BLACKJACK_SERVICE_GRPC || 'localhost:50054',
    dashboard: process.env.DASHBOARD_SERVICE_GRPC || 'localhost:50055'
  };

  const clients = {};

  // Create Slots client
  try {
    const slotsProto = loadProto(PROTO_PATH.slots);
    const rawClient = new slotsProto.slots.SlotsService(
      endpoints.slots,
      grpc.credentials.createInsecure()
    );
    clients.slots = enhanceClient(rawClient, 'slots');
    console.log(`✅ Slots gRPC client connected to ${endpoints.slots}`);
  } catch (error) {
    console.error(`❌ Failed to create Slots gRPC client to ${endpoints.slots}:`, error.message);
    console.error('Error stack:', error.stack);
    console.warn('⚠️  Falling back to HTTP mock client for slots');
    clients.slots = createMockClient('slots');
  }

  // Create Roulette client
  try {
    const rouletteProto = loadProto(PROTO_PATH.roulette);
    const rawClient = new rouletteProto.roulette.RouletteService(
      endpoints.roulette,
      grpc.credentials.createInsecure()
    );
    clients.roulette = enhanceClient(rawClient, 'roulette');
    console.log(`✅ Roulette gRPC client connected to ${endpoints.roulette}`);
  } catch (error) {
    console.error(`❌ Failed to create Roulette gRPC client to ${endpoints.roulette}:`, error.message);
    console.error('Error stack:', error.stack);
    console.warn('⚠️  Falling back to HTTP mock client for roulette');
    clients.roulette = createMockClient('roulette');
  }

  // Create Dice client
  try {
    const diceProto = loadProto(PROTO_PATH.dice);
    const rawClient = new diceProto.dice.DiceService(
      endpoints.dice,
      grpc.credentials.createInsecure()
    );
    clients.dice = enhanceClient(rawClient, 'dice');
    console.log(`✅ Dice gRPC client connected to ${endpoints.dice}`);
  } catch (error) {
    console.error(`❌ Failed to create Dice gRPC client to ${endpoints.dice}:`, error.message);
    console.error('Error stack:', error.stack);
    console.warn('⚠️  Falling back to HTTP mock client for dice');
    clients.dice = createMockClient('dice');
  }

  // Create Blackjack client
  try {
    const blackjackProto = loadProto(PROTO_PATH.blackjack);
    const rawClient = new blackjackProto.blackjack.BlackjackService(
      endpoints.blackjack,
      grpc.credentials.createInsecure()
    );
    clients.blackjack = enhanceClient(rawClient, 'blackjack');
    console.log(`✅ Blackjack gRPC client connected to ${endpoints.blackjack}`);
  } catch (error) {
    console.error(`❌ Failed to create Blackjack gRPC client to ${endpoints.blackjack}:`, error.message);
    console.error('Error stack:', error.stack);
    console.warn('⚠️  Falling back to HTTP mock client for blackjack');
    clients.blackjack = createMockClient('blackjack');
  }

  // Create Dashboard client
  try {
    const dashboardProto = loadProto(PROTO_PATH.dashboard);
    const rawClient = new dashboardProto.dashboard.DashboardService(
      endpoints.dashboard,
      grpc.credentials.createInsecure()
    );
    clients.dashboard = enhanceClient(rawClient, 'dashboard');
    console.log(`✅ Dashboard gRPC client connected to ${endpoints.dashboard}`);
  } catch (error) {
    console.error(`❌ Failed to create Dashboard gRPC client to ${endpoints.dashboard}:`, error.message);
    console.error('Error stack:', error.stack);
    console.warn('⚠️  Falling back to HTTP mock client for dashboard');
    clients.dashboard = createMockClient('dashboard');
  }

  return clients;
}

// Helper to promisify gRPC calls with trace context propagation
function promisifyGrpcCall(client, method, request) {
  return new Promise((resolve, reject) => {
    // Check if client is available
    if (!client || typeof client[method] !== 'function') {
      const error = new Error(`gRPC client or method ${method} not available`);
      error.code = grpc.status.UNAVAILABLE;
      reject(error);
      return;
    }
    
    // Get current trace context
    const activeContext = context.active();
    const activeSpan = trace.getActiveSpan(activeContext);
    
    // Log trace context for debugging
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      console.log(`[gRPC] Making ${method} call - Trace context: traceId=${spanContext.traceId}, spanId=${spanContext.spanId}`);
    } else {
      console.log(`[gRPC] Making ${method} call - No active span in context`);
    }
    
    // Inject trace context into gRPC metadata
    const metadata = new grpc.Metadata();
    const carrier = {
      set: (key, value) => {
        metadata.add(key, String(value));
        console.log(`[gRPC] Injected trace context header: ${key}=${value.substring(0, 50)}...`);
      }
    };
    propagation.inject(activeContext, carrier);
    
    console.log(`[gRPC] Making ${method} call with request:`, JSON.stringify(request).substring(0, 200));
    
    // Set a timeout for the call
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 10); // 10 second timeout
    
    // Make gRPC call with metadata
    // Note: Auto-instrumentation will create spans automatically
    const call = client[method](request, metadata, { deadline }, (error, response) => {
      if (error) {
        // Provide more detailed error information
        const errorDetails = {
          code: error.code,
          message: error.message,
          details: error.details || '',
          metadata: error.metadata ? error.metadata.getMap() : {}
        };
        
        // Map gRPC error codes to user-friendly messages
        let userMessage = error.message;
        if (error.code === grpc.status.UNAVAILABLE) {
          userMessage = `Service unavailable. The game service may not be running or reachable. Original error: ${error.message}`;
        } else if (error.code === grpc.status.DEADLINE_EXCEEDED) {
          userMessage = `Request timeout. The game service took too long to respond.`;
        }
        
        console.error(`[gRPC] ${method} call failed:`, error.code, error.message, errorDetails);
        const enhancedError = new Error(userMessage);
        enhancedError.code = error.code;
        enhancedError.details = errorDetails;
        reject(enhancedError);
      } else {
        console.log(`[gRPC] ${method} call succeeded`);
        resolve(response);
      }
    });
    
    // Handle call errors
    call.on('error', (error) => {
      console.error(`[gRPC] ${method} call error event:`, error.code, error.message);
      const enhancedError = new Error(`gRPC connection error: ${error.message}`);
      enhancedError.code = error.code || grpc.status.UNAVAILABLE;
      reject(enhancedError);
    });
    
    // Handle call cancellation
    call.on('cancelled', () => {
      const error = new Error('gRPC call was cancelled');
      error.code = grpc.status.CANCELLED;
      reject(error);
    });
  });
}

// Enhanced client wrapper with all game methods
function enhanceClient(client, serviceName) {
  if (!client) {
    return createMockClient(serviceName);
  }

  const enhanced = {
    // Health check
    health: async () => {
      return promisifyGrpcCall(client, 'Health', {});
    },

    // Deprecated: getGameAssets removed - games are now static HTML files
  };

  // Add service-specific methods
  if (serviceName === 'slots') {
    enhanced.spin = async (request) => {
      const req = {
        bet_amount: request.bet_amount || 10,
        cheat_active: request.cheat_active || false,
        cheat_type: request.cheat_type || '',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Spin', req);
    };
  } else if (serviceName === 'roulette') {
    enhanced.spin = async (request) => {
      const req = {
        bet_type: request.bet_type || 'red',
        bet_amount: request.bet_amount || 10,
        cheat_active: request.cheat_active || false,
        cheat_type: request.cheat_type || '',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Spin', req);
    };
  } else if (serviceName === 'dice') {
    enhanced.roll = async (request) => {
      const req = {
        bet_amount: request.bet_amount || 10,
        bet_type: request.bet_type || 'pass',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Roll', req);
    };
  } else if (serviceName === 'blackjack') {
    enhanced.deal = async (request) => {
      const req = {
        bet_amount: request.bet_amount || 10,
        username: request.username || 'Anonymous',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Deal', req);
    };
    enhanced.hit = async (request) => {
      const req = {
        username: request.username || 'Anonymous',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Hit', req);
    };
    enhanced.stand = async (request) => {
      const req = {
        username: request.username || 'Anonymous',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Stand', req);
    };
    enhanced.double = async (request) => {
      const req = {
        username: request.username || 'Anonymous',
        player_info: request.player_info || {}
      };
      return promisifyGrpcCall(client, 'Double', req);
    };
  } else if (serviceName === 'dashboard') {
    // Dashboard analytics service
    enhanced.getDashboardStats = async (request) => {
      const req = {
        game: request.game || 'all',
      };
      return promisifyGrpcCall(client, 'GetDashboardStats', req);
    };

    enhanced.getAllDashboardStats = async () => {
      const req = {};
      return promisifyGrpcCall(client, 'GetAllDashboardStats', req);
    };
  }

  return enhanced;
}

// Mock client for development (falls back to HTTP if gRPC not available)
function createMockClient(gameType) {
  return {
    health: async () => ({ status: 'ok', service: gameType }),
    // Deprecated: getGameAssets removed - games are now static HTML files
    // Mock game methods that fall back to HTTP
    spin: async (request) => {
      const http = require('http');
      return new Promise((resolve, reject) => {
        const postData = JSON.stringify(request);
        
        // Get current trace context and inject into headers
        const activeContext = context.active();
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        };
        propagation.inject(activeContext, headers);
        
        const options = {
          hostname: getHttpHost(gameType),
          port: getHttpPort(gameType),
          path: '/spin',
          method: 'POST',
          headers: headers
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    },
    roll: async (request) => {
      const http = require('http');
      return new Promise((resolve, reject) => {
        const postData = JSON.stringify(request);
        
        // Get current trace context and inject into headers
        const activeContext = context.active();
        const headers = {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        };
        propagation.inject(activeContext, headers);
        
        const options = {
          hostname: getHttpHost(gameType),
          port: getHttpPort(gameType),
          path: '/roll',
          method: 'POST',
          headers: headers
        };
        
        const req = http.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });
        
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }
  };
}

function getHttpPort(gameType) {
  const ports = {
    slots: 8081,
    roulette: 8082,
    dice: 8083,
    blackjack: 8084
  };
  return ports[gameType] || 8080;
}

function getHttpHost(gameType) {
  // Use Kubernetes service names if available, otherwise localhost
  // Service names follow the pattern: vegas-casino-{game}
  const hosts = {
    slots: process.env.SLOTS_SERVICE_URL?.replace(/^https?:\/\//, '').split(':')[0] || 
           (process.env.KUBERNETES_SERVICE_HOST ? 'vegas-casino-slots' : 'localhost'),
    roulette: process.env.ROULETTE_SERVICE_URL?.replace(/^https?:\/\//, '').split(':')[0] || 
              (process.env.KUBERNETES_SERVICE_HOST ? 'vegas-casino-roulette' : 'localhost'),
    dice: process.env.DICE_SERVICE_URL?.replace(/^https?:\/\//, '').split(':')[0] || 
          (process.env.KUBERNETES_SERVICE_HOST ? 'vegas-casino-dice' : 'localhost'),
    blackjack: process.env.BLACKJACK_SERVICE_URL?.replace(/^https?:\/\//, '').split(':')[0] || 
               (process.env.KUBERNETES_SERVICE_HOST ? 'vegas-casino-blackjack' : 'localhost')
  };
  // Extract hostname from URL if it's a full URL, otherwise use as-is
  const host = hosts[gameType] || 'localhost';
  return host.split(':')[0]; // Remove port if present
}

module.exports = { createClient };

