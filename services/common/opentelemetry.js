/**
 * OpenTelemetry Instrumentation Setup for Node.js Services
 * Uses semantic conventions for standard attributes
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-otlp-grpc');
const { trace, propagation } = require('@opentelemetry/api');
const { W3CTraceContextPropagator } = require('@opentelemetry/core');

// Initialize OpenTelemetry SDK
function initializeTelemetry(serviceName, serviceMetadata = {}) {
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.SERVICE_NAMESPACE]: process.env.SERVICE_NAMESPACE || 'vegas-casino',
    [SemanticResourceAttributes.SERVICE_VERSION]: serviceMetadata.version || process.env.SERVICE_VERSION || '2.1.0',
    [SemanticResourceAttributes.SERVICE_INSTANCE_ID]: process.env.SERVICE_INSTANCE_ID || `${serviceName}-${process.pid}`,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.DEPLOYMENT_ENVIRONMENT || 'production',
    [SemanticResourceAttributes.CLOUD_PROVIDER]: process.env.CLOUD_PROVIDER || 'unknown',
    [SemanticResourceAttributes.CLOUD_REGION]: process.env.CLOUD_REGION || 'unknown',
    // Custom game attributes
    'game.category': serviceMetadata.gameCategory || process.env.GAME_CATEGORY || 'unknown',
    'game.type': serviceMetadata.gameType || process.env.GAME_TYPE || 'unknown',
    'game.complexity': serviceMetadata.complexity || process.env.GAME_COMPLEXITY || 'medium',
    'game.rtp': serviceMetadata.rtp || process.env.GAME_RTP || 'variable',
    'game.max_payout': serviceMetadata.maxPayout || process.env.GAME_MAX_PAYOUT || '1x',
    'game.owner': serviceMetadata.owner || process.env.GAME_OWNER || 'Vegas-Casino-Team',
    'game.technology': serviceMetadata.technology || process.env.GAME_TECHNOLOGY || 'Node.js',
  });

  // Format endpoint for gRPC (add http:// if not present, gRPC exporter will handle it)
  let endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (endpoint && !endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    // gRPC exporter expects full URL, add http:// prefix
    endpoint = `http://${endpoint}`;
  }

  // Check if insecure connection is requested (disable TLS/SSL)
  const insecure = process.env.OTEL_EXPORTER_OTLP_INSECURE === 'true' || 
                   process.env.OTEL_EXPORTER_OTLP_INSECURE === '1';

  const sdk = new NodeSDK({
    resource,
    traceExporter: endpoint 
      ? new OTLPTraceExporter({
          url: endpoint,
          // OTLP gRPC exporter uses the endpoint directly (no path needed)
          // Disable TLS/SSL if insecure is set
          ...(insecure && {
            credentials: require('@grpc/grpc-js').credentials.createInsecure()
          }),
        })
      : undefined, // Use default OTLP exporter or console
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-grpc': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-fetch': {
          enabled: true,
        },
      }),
    ],
  });

  // Configure W3C TraceContext propagator for trace context propagation
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());

  // Explicitly start the SDK so that auto-instrumentations and exporters are active.
  // Handle both Promise-returning and synchronous start() methods
  try {
    const startResult = sdk.start();
    if (startResult && typeof startResult.then === 'function') {
      // start() returns a Promise
      startResult
        .then(() => {
          console.log(
            `[OpenTelemetry] SDK started for service: ${serviceName} with W3C TraceContext propagator (endpoint: ${
              endpoint || 'default'
            })`
          );
        })
        .catch((error) => {
          console.error('[OpenTelemetry] Failed to start SDK', error);
        });
    } else {
      // start() is synchronous or doesn't return a Promise
      console.log(
        `[OpenTelemetry] SDK initialized for service: ${serviceName} with W3C TraceContext propagator (endpoint: ${
          endpoint || 'default'
        })`
      );
    }
  } catch (error) {
    console.error('[OpenTelemetry] Error during SDK start:', error);
  }

  // Ensure spans are flushed on shutdown
  const shutdown = () => {
    try {
      const shutdownResult = sdk.shutdown();
      if (shutdownResult && typeof shutdownResult.then === 'function') {
        // shutdown() returns a Promise
        shutdownResult
          .then(() => console.log('[OpenTelemetry] SDK shutdown complete'))
          .catch((err) => console.error('[OpenTelemetry] Error during SDK shutdown', err))
          .finally(() => {
            // Do not force-exit here; let the process decide.
          });
      } else {
        // shutdown() is synchronous
        console.log('[OpenTelemetry] SDK shutdown initiated');
      }
    } catch (err) {
      console.error('[OpenTelemetry] Error during SDK shutdown', err);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  return trace.getTracer(serviceName);
}

// Helper to add game attributes to current span
function addGameAttributes(attributes) {
  const span = trace.getActiveSpan();
  if (span) {
    const gameAttributes = {};
    Object.keys(attributes).forEach(key => {
      gameAttributes[`game.${key}`] = attributes[key];
    });
    span.setAttributes(gameAttributes);
  }
}

// Helper to add semantic convention attributes
function addServiceAttributes(attributes) {
  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

module.exports = {
  initializeTelemetry,
  addGameAttributes,
  addServiceAttributes,
  trace,
};


