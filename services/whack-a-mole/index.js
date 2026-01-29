/**
 * Whack-A-Mole Service Entry Point
 * Supports both HTTP and gRPC
 */

// Initialize OpenTelemetry first
const { initializeTelemetry } = require('../common/opentelemetry');
initializeTelemetry('vegas-whack-a-mole-service', {
  version: '1.0.0',
  gameType: 'whack-a-mole',
  gameCategory: 'arcade-games',
  complexity: 'medium',
  rtp: '96.5%',
  owner: 'Arcade-Games-Team',
  technology: 'Node.js-Express-WhackAMole',
  maxPayout: '1.5x'
});

// Initialize OpenFeature
const { initializeOpenFeature } = require('../common/openfeature');
initializeOpenFeature('vegas-whack-a-mole-service');

// Start the gRPC-enabled service
require('./whack-a-mole-service-grpc');
