const express = require('express');
const http = require('http');
const { trace, context, propagation } = require('@opentelemetry/api');

function createService(name, mountFn, metadata = {}) {
  try { 
    // Set process title for distinct process identification
    process.title = name;
  } catch (_) {}
  
  const app = express();
  app.use(express.json());

  // OpenTelemetry middleware - extract trace context and add attributes to spans
  // Note: Auto-instrumentation handles span creation, we just add attributes
  app.use((req, res, next) => {
    // Extract trace context from incoming request headers
    const carrier = {};
    Object.keys(req.headers).forEach(key => {
      carrier[key.toLowerCase()] = req.headers[key];
    });
    const extractedContext = propagation.extract(context.active(), carrier);
    
    // Run in the extracted context (or active context if extraction failed)
    context.with(extractedContext, () => {
      const span = trace.getActiveSpan();
      
      if (span) {
        // Set semantic convention attributes
        span.setAttributes({
          'http.method': req.method,
          'http.route': req.path,
          'http.target': req.url,
          'http.scheme': req.protocol,
          'http.user_agent': req.get('user-agent') || '',
        });

        // Set game attributes
        if (metadata.gameType) {
          span.setAttribute('game.type', metadata.gameType);
        }
        if (metadata.gameCategory) {
          span.setAttribute('game.category', metadata.gameCategory || getGameCategory(name));
        }
        if (metadata.complexity) {
          span.setAttribute('game.complexity', metadata.complexity);
        }
        if (metadata.rtp) {
          span.setAttribute('game.rtp', metadata.rtp);
        }
        if (metadata.maxPayout) {
          span.setAttribute('game.max_payout', metadata.maxPayout);
        }
        if (metadata.owner) {
          span.setAttribute('game.owner', metadata.owner);
        }
        if (metadata.technology) {
          span.setAttribute('game.technology', metadata.technology);
        }
        
        // Store span in request for later use
        req.span = span;
      }
      
      next();
    });
  });

  // Health check endpoint
  app.get('/health', (_req, res) => {
    const tracer = trace.getTracer(name);
    const span = tracer.startSpan('health_check');
    
    span.setAttributes({
      'service.name': name,
      'service.version': metadata.version || '2.1.0',
      'game.category': metadata.gameCategory || getGameCategory(name),
      'game.type': metadata.gameType || 'unknown',
      'game.complexity': metadata.complexity || 'medium',
      'game.rtp': metadata.rtp || 'variable',
      'game.max_payout': metadata.maxPayout || '1x',
      'game.owner': metadata.owner || 'Vegas-Casino-Team',
      'game.technology': metadata.technology || 'Node.js-Express',
    });

    const response = {
      status: 'ok',
      service: name,
      serviceMetadata: {
        version: metadata.version || '2.1.0',
        gameType: metadata.gameType || 'unknown',
        gameCategory: metadata.gameCategory || getGameCategory(name),
        complexity: metadata.complexity || 'medium',
        rtp: metadata.rtp || 'variable',
        maxPayout: metadata.maxPayout || '1x',
        owner: metadata.owner || 'Vegas-Casino-Team',
        technology: metadata.technology || 'Node.js-Express',
        timestamp: new Date().toISOString()
      }
    };

    span.end();
    res.json(response);
  });

  // Mount service-specific routes
  mountFn(app);

  const server = http.createServer(app);
  const port = process.env.PORT || 0; // dynamic by default
  server.listen(port, () => {
    const address = server.address();
    const actualPort = typeof address === 'string' ? address : address.port;
    console.log(`[${name}] listening on port ${actualPort}`);
  });
}

function getGameCategory(serviceName) {
  const categories = {
    'vegas-slots-service': 'slot-machines',
    'vegas-roulette-service': 'table-games',
    'vegas-dice-service': 'dice-games',
    'vegas-blackjack-service': 'card-games'
  };
  return categories[serviceName] || 'unknown';
}

module.exports = { createService };


