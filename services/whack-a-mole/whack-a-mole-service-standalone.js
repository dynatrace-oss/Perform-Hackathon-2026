/**
 * Whack-A-Mole Service Standalone
 * HTTP-only version without gRPC
 */

const express = require('express');
const { initializeTelemetry } = require('../common/opentelemetry');
const { initializeOpenFeature } = require('../common/openfeature');
const Logger = require('../common/logger');

// Initialize OpenTelemetry first
initializeTelemetry('vegas-whack-a-mole-service-standalone', {
  version: '1.0.0',
  gameType: 'whack-a-mole',
  gameCategory: 'arcade-games',
  complexity: 'medium',
  rtp: '96.5%',
  owner: 'Arcade-Games-Team',
  technology: 'Node.js-Express-WhackAMole-Standalone'
});

// Initialize OpenFeature
initializeOpenFeature('vegas-whack-a-mole-service-standalone');

const logger = new Logger('vegas-whack-a-mole-service-standalone');
const app = express();
app.use(express.json());

// Import the service implementation
const serviceImplementation = require('./whack-a-mole-service.js');

const PORT = process.env.PORT || 3011;

app.listen(PORT, () => {
  logger.info(`Whack-A-Mole Service (Standalone) running on port ${PORT}`);
});
