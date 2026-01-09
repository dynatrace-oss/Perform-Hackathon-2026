/**
 * Roulette Service Entry Point
 * Supports both HTTP and gRPC (Python implementation)
 */

// For Node.js version (if exists)
if (require('fs').existsSync(__dirname + '/roulette-service.js')) {
  require('./roulette-service');
}

// Python version is in python/ directory
// Run with: python services/roulette/python/roulette_service_grpc.py








