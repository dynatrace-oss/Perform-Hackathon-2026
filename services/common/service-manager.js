/**
 * Service Manager - Manages microservices lifecycle
 * Provides API for starting, stopping, and monitoring services
 */

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

class ServiceManager {
  constructor() {
    this.services = new Map();
    this.serviceConfigs = {
      'vegas-slots-service': {
        name: 'vegas-slots-service',
        script: path.join(__dirname, '../slots/index.js'),
        port: 8081,
        displayName: 'Slots Service',
        description: 'Slot machine game service',
        category: 'slot-machines',
        icon: '🎰'
      },
      'vegas-roulette-service': {
        name: 'vegas-roulette-service',
        script: path.join(__dirname, '../roulette/index.js'),
        port: 8082,
        displayName: 'Roulette Service',
        description: 'Roulette wheel game service',
        category: 'table-games',
        icon: '🎲'
      },
      'vegas-dice-service': {
        name: 'vegas-dice-service',
        script: path.join(__dirname, '../dice/index.js'),
        port: 8083,
        displayName: 'Dice Service',
        description: 'Dice rolling game service',
        category: 'dice-games',
        icon: '🎯'
      },
      'vegas-blackjack-service': {
        name: 'vegas-blackjack-service',
        script: path.join(__dirname, '../blackjack/index.js'),
        port: 8084,
        displayName: 'Blackjack Service',
        description: 'Blackjack card game service',
        category: 'card-games',
        icon: '🃏'
      }
    };
  }

  /**
   * Start a service
   */
  startService(serviceName) {
    if (this.services.has(serviceName)) {
      return { success: false, message: 'Service already running', service: serviceName };
    }

    const config = this.serviceConfigs[serviceName];
    if (!config) {
      return { success: false, message: 'Unknown service', service: serviceName };
    }

    const env = {
      ...process.env,
      PORT: String(config.port),
      SERVICE_NAME: serviceName,
      // OpenTelemetry standard environment variables
      OTEL_SERVICE_NAME: serviceName,
      OTEL_SERVICE_VERSION: '2.1.0',
      OTEL_RESOURCE_ATTRIBUTES: [
        `service.name=${serviceName}`,
        `service.version=2.1.0`,
        `service.namespace=vegas-casino`,
        `deployment.environment=production`,
        `k8s.cluster.name=vegas-${config.category}-cluster`,
        `k8s.node.name=${serviceName}-node`,
        `service.instance.id=${serviceName}-${process.pid}`,
        `application.name=Vegas-Casino-${config.category}`
      ].join(','),
      // Legacy SERVICE_* variables for backward compatibility
      SERVICE_NAMESPACE: 'vegas-casino',
      SERVICE_VERSION: '2.1.0',
      DEPLOYMENT_ENVIRONMENT: 'production'
    };

    const child = spawn('node', [config.script], {
      cwd: path.dirname(__dirname),
      env: env,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const serviceInfo = {
      name: serviceName,
      config: config,
      process: child,
      status: 'starting',
      startedAt: new Date().toISOString(),
      pid: child.pid
    };

    child.stdout.on('data', (data) => {
      console.log(`[${serviceName}] ${data.toString().trim()}`);
    });

    child.stderr.on('data', (data) => {
      console.error(`[${serviceName}][ERR] ${data.toString().trim()}`);
    });

    child.on('exit', (code) => {
      console.log(`[${serviceName}] exited with code ${code}`);
      const info = this.services.get(serviceName);
      if (info) {
        info.status = 'stopped';
        info.stoppedAt = new Date().toISOString();
        info.exitCode = code;
      }
      // Don't delete immediately - keep for status tracking
      setTimeout(() => {
        if (this.services.get(serviceName)?.status === 'stopped') {
          this.services.delete(serviceName);
        }
      }, 60000); // Keep for 1 minute after stopping
    });

    // Check if service is healthy after a short delay
    setTimeout(() => {
      this.checkServiceHealth(serviceName).then(healthy => {
        const info = this.services.get(serviceName);
        if (info) {
          info.status = healthy ? 'running' : 'unhealthy';
          info.healthCheckedAt = new Date().toISOString();
        }
      });
    }, 2000);

    this.services.set(serviceName, serviceInfo);
    return { success: true, message: 'Service started', service: serviceName, pid: child.pid };
  }

  /**
   * Stop a service
   */
  stopService(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    if (!serviceInfo) {
      return { success: false, message: 'Service not running', service: serviceName };
    }

    if (serviceInfo.process) {
      serviceInfo.process.kill('SIGTERM');
      serviceInfo.status = 'stopping';
      serviceInfo.stoppedAt = new Date().toISOString();
      return { success: true, message: 'Service stop signal sent', service: serviceName };
    }

    return { success: false, message: 'Service process not found', service: serviceName };
  }

  /**
   * Restart a service
   */
  restartService(serviceName) {
    this.stopService(serviceName);
    setTimeout(() => {
      this.startService(serviceName);
    }, 1000);
    return { success: true, message: 'Service restart initiated', service: serviceName };
  }

  /**
   * Check service health
   */
  async checkServiceHealth(serviceName) {
    const config = this.serviceConfigs[serviceName];
    if (!config) return false;

    return new Promise((resolve) => {
      const options = {
        hostname: '127.0.0.1',
        port: config.port,
        path: '/health',
        method: 'GET',
        timeout: 2000
      };

      const req = http.request(options, (res) => {
        resolve(res.statusCode === 200);
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Get service status
   */
  getServiceStatus(serviceName) {
    const serviceInfo = this.services.get(serviceName);
    const config = this.serviceConfigs[serviceName];

    if (!config) {
      return { exists: false };
    }

    if (!serviceInfo) {
      return {
        exists: true,
        running: false,
        status: 'stopped',
        config: config
      };
    }

    return {
      exists: true,
      running: serviceInfo.status === 'running',
      status: serviceInfo.status,
      pid: serviceInfo.pid,
      startedAt: serviceInfo.startedAt,
      stoppedAt: serviceInfo.stoppedAt,
      config: config
    };
  }

  /**
   * Get all services status
   */
  getAllServicesStatus() {
    const statuses = {};
    for (const serviceName of Object.keys(this.serviceConfigs)) {
      statuses[serviceName] = this.getServiceStatus(serviceName);
    }
    return statuses;
  }

  /**
   * Get service configuration
   */
  getServiceConfig(serviceName) {
    return this.serviceConfigs[serviceName] || null;
  }

  /**
   * Get all service configurations
   */
  getAllServiceConfigs() {
    return this.serviceConfigs;
  }
}

module.exports = ServiceManager;

