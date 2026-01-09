/**
 * OpenFeature initialization with flagd provider and OpenTelemetry integration
 */

const { OpenFeature } = require('@openfeature/js-sdk');
const { FlagdProvider } = require('@openfeature/flagd-provider');
const { trace } = require('@opentelemetry/api');
const { TracingHook } = require('@openfeature/extra');

// Get flagd connection details from environment
const FLAGD_HOST = process.env.FLAGD_HOST || 'localhost';
const FLAGD_PORT = process.env.FLAGD_PORT || 8013;
const FLAGD_TLS = process.env.FLAGD_TLS === 'true';

let client = null;

/**
 * Initialize OpenFeature with flagd provider and OpenTelemetry integration
 */
function initializeOpenFeature(serviceName = 'vegas-service') {
  if (client) {
    return client;
  }

  try {
    // Create flagd provider
    const provider = new FlagdProvider({
      host: FLAGD_HOST,
      port: FLAGD_PORT,
      tls: FLAGD_TLS,
    });

    // Create OpenFeature client
    OpenFeature.setProvider(provider);

    // Add OpenTelemetry tracing hook
    OpenFeature.addHooks([new TracingHook()]);

    // Create client with service context
    client = OpenFeature.getClient(serviceName, {
      name: serviceName,
    });

    console.log(`✅ OpenFeature initialized for ${serviceName} (flagd: ${FLAGD_HOST}:${FLAGD_PORT})`);
  } catch (error) {
    console.error(`❌ Failed to initialize OpenFeature: ${error.message}`);
    // Return a mock client that always returns default values
    client = {
      getBooleanValue: (key, defaultValue) => defaultValue,
      getStringValue: (key, defaultValue) => defaultValue,
      getNumberValue: (key, defaultValue) => defaultValue,
      getObjectValue: (key, defaultValue) => defaultValue,
    };
  }

  return client;
}

/**
 * Get feature flag value with OpenTelemetry tracing
 */
async function getFeatureFlag(key, defaultValue, context = {}) {
  if (!client) {
    return defaultValue;
  }

  const tracer = trace.getTracer('openfeature');
  const span = tracer.startSpan(`feature_flag.${key}`);

  try {
    span.setAttributes({
      'feature_flag.key': key,
      'feature_flag.provider': 'flagd',
    });

    // Determine flag type and get value
    if (typeof defaultValue === 'boolean') {
      const value = await client.getBooleanValue(key, defaultValue, context);
      span.setAttribute('feature_flag.value', value);
      span.setAttribute('feature_flag.type', 'boolean');
      return value;
    } else if (typeof defaultValue === 'number') {
      const value = await client.getNumberValue(key, defaultValue, context);
      span.setAttribute('feature_flag.value', value);
      span.setAttribute('feature_flag.type', 'number');
      return value;
    } else if (typeof defaultValue === 'string') {
      const value = await client.getStringValue(key, defaultValue, context);
      span.setAttribute('feature_flag.value', value);
      span.setAttribute('feature_flag.type', 'string');
      return value;
    } else {
      const value = await client.getObjectValue(key, defaultValue, context);
      span.setAttribute('feature_flag.type', 'object');
      return value;
    }
  } catch (error) {
    span.recordException(error);
    span.setAttribute('feature_flag.error', true);
    console.error(`Error getting feature flag ${key}:`, error);
    return defaultValue;
  } finally {
    span.end();
  }
}

module.exports = {
  initializeOpenFeature,
  getFeatureFlag,
  OpenFeature,
};

