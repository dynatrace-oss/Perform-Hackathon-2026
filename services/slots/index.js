/**
 * Slots Service Entry Point
 * Supports both HTTP and gRPC
 */

// Initialize OpenTelemetry first
const { initializeTelemetry } = require('./common/opentelemetry');
initializeTelemetry('vegas-slots-service', {
  version: '2.1.0',
  gameType: 'slots-machine',
  gameCategory: 'slot-machines',
  complexity: 'high',
  rtp: '96.5%',
  owner: 'Gaming-Backend-Team',
  technology: 'Node.js-Express-Slots',
  maxPayout: '100x'
});

// Initialize OpenFeature
const { initializeOpenFeature } = require('./common/openfeature');
initializeOpenFeature('vegas-slots-service');

// Start the gRPC-enabled service
require('./slots-service-grpc');

