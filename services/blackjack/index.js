/**
 * Blackjack Service Entry Point
 * Supports both HTTP and gRPC
 */

// Initialize OpenTelemetry first
const { initializeTelemetry } = require('./common/opentelemetry');
initializeTelemetry('vegas-blackjack-service', {
  version: '2.1.0',
  gameType: 'blackjack-21',
  gameCategory: 'card-games',
  complexity: 'high',
  rtp: '99.5%',
  owner: 'Card-Games-Team',
  technology: 'Node.js-Express-Blackjack',
  maxPayout: '2.5x'
});

// Initialize OpenFeature
const { initializeOpenFeature } = require('./common/openfeature');
initializeOpenFeature('vegas-blackjack-service');

// Start the gRPC-enabled service
require('./blackjack-service-grpc');

