/**
 * OpenFeature initialization with flagd provider and OpenTelemetry integration
 */

const { OpenFeature } = require('@openfeature/server-sdk');
const { FlagdProvider } = require('@openfeature/flagd-provider');
const { trace, context } = require('@opentelemetry/api');
const Logger = require('./logger');

// Simple tracing hook implementation for OpenTelemetry
// Note: flagd automatically creates spans for flag evaluations, so we just add attributes to parent spans
class TracingHook {
  before(hookContext) {
    // flagd/provider will automatically create spans, we just track the flag key
    hookContext.context = hookContext.context || {};
    return hookContext;
  }

  after(hookContext, evaluationDetails) {
    // Add feature flag info to parent span for easy filtering
    // flagd automatically creates spans, so we just enrich the parent span
    const parentSpan = trace.getActiveSpan();
    if (parentSpan) {
      parentSpan.setAttributes({
        [`feature_flag.${hookContext.flagKey.replace(/\./g, '_')}`]: String(evaluationDetails.value),
        [`feature_flag.${hookContext.flagKey.replace(/\./g, '_')}.variant`]: evaluationDetails.variant || 'default',
        [`feature_flag.${hookContext.flagKey.replace(/\./g, '_')}.reason`]: evaluationDetails.reason || 'STATIC',
      });
    }
    return hookContext;
  }

  error(hookContext, err) {
    // Add error info to parent span
    const parentSpan = trace.getActiveSpan();
    if (parentSpan) {
      parentSpan.recordException(err);
      parentSpan.setAttribute(`feature_flag.${hookContext.flagKey.replace(/\./g, '_')}.error`, true);
    }
    return hookContext;
  }

  finally(hookContext) {
    // No cleanup needed - flagd handles span lifecycle
    return hookContext;
  }
}

// Get flagd connection details from environment
// When using OpenFeature Operator, it automatically injects flagd sidecar on localhost
// The port should match the FeatureFlagSource port (default: 8014)
const FLAGD_HOST = process.env.FLAGD_HOST || 'localhost';
const FLAGD_PORT = process.env.FLAGD_PORT || 8014;
const FLAGD_TLS = process.env.FLAGD_TLS === 'true';

let client = null;
let logger = null;

/**
 * Initialize OpenFeature with flagd provider and OpenTelemetry integration
 */
function initializeOpenFeature(serviceName = 'vegas-service') {
  // Initialize logger for this service
  if (!logger) {
    logger = new Logger(serviceName);
  }
  if (client) {
    return client;
  }

  try {
    // Create flagd provider
    const provider = new FlagdProvider({
      host: FLAGD_HOST,
      port: Number(FLAGD_PORT),
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
    logger.logInfo('OpenFeature initialized', { flagd_host: FLAGD_HOST, flagd_port: FLAGD_PORT });
  } catch (error) {
    console.error(`❌ Failed to initialize OpenFeature: ${error.message}`);
    logger.logError(error, { context: 'OpenFeature initialization' });
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
 * Note: flagd/provider automatically creates spans for flag evaluations
 * This function just adds attributes to the parent span for easy filtering
 */
async function getFeatureFlag(key, defaultValue, evalContext = {}) {
  if (!client) {
    console.warn(`[OpenFeature] Client not initialized, returning default for ${key}`);
    if (logger) {
      logger.logWarning('Feature flag evaluation failed - client not initialized', { flag_key: key, default_value: defaultValue });
    }
    return defaultValue;
  }

  const parentSpan = trace.getActiveSpan();
  
  try {
    let value;
    // Determine flag type and get evaluation details (which includes value)
    // flagd/provider will automatically create spans for these calls
    // Always use getDetails methods first to get accurate reason and variant
    let evaluationDetails = null;
    if (typeof defaultValue === 'boolean') {
      if (client.getBooleanDetails) {
        evaluationDetails = await client.getBooleanDetails(key, defaultValue, evalContext);
        value = evaluationDetails.value;
      } else {
        // Fallback if getDetails doesn't exist
        value = await client.getBooleanValue(key, defaultValue, evalContext);
      }
    } else if (typeof defaultValue === 'number') {
      if (client.getNumberDetails) {
        evaluationDetails = await client.getNumberDetails(key, defaultValue, evalContext);
        value = evaluationDetails.value;
      } else {
        value = await client.getNumberValue(key, defaultValue, evalContext);
      }
    } else if (typeof defaultValue === 'string') {
      if (client.getStringDetails) {
        evaluationDetails = await client.getStringDetails(key, defaultValue, evalContext);
        value = evaluationDetails.value;
      } else {
        value = await client.getStringValue(key, defaultValue, evalContext);
      }
    } else {
      if (client.getObjectDetails) {
        evaluationDetails = await client.getObjectDetails(key, defaultValue, evalContext);
        value = evaluationDetails.value;
      } else {
        value = await client.getObjectValue(key, defaultValue, evalContext);
      }
    }
    
    // Log feature flag evaluation
    if (logger) {
      if (evaluationDetails) {
        // If reason is ERROR, log additional context for debugging
        if (evaluationDetails.reason === 'ERROR') {
          const errorInfo = {
            flag_key: key,
            flag_value: value,
            flag_variant: evaluationDetails.variant,
            flag_reason: evaluationDetails.reason
          };
          // Add error details if available (OpenFeature SDK may include these)
          if (evaluationDetails.errorCode !== undefined) {
            errorInfo.error_code = evaluationDetails.errorCode;
          }
          if (evaluationDetails.errorMessage) {
            errorInfo.error_message = evaluationDetails.errorMessage;
          }
          // Log all evaluationDetails properties for debugging
          console.warn(`[OpenFeature] Flag evaluation returned ERROR: ${key}`, {
            ...errorInfo,
            full_details: JSON.stringify(evaluationDetails, null, 2)
          });
          logger.logWarning('Feature flag evaluation returned ERROR reason', errorInfo);
        }
        logger.logFeatureFlag(key, value, evaluationDetails.variant, evaluationDetails.reason, evalContext);
      } else {
        // Fallback: log without details if getDetails methods don't exist
        logger.logFeatureFlag(key, value, 'default', 'STATIC', evalContext);
      }
    }
    
    // Add to parent span for easy filtering (flagd spans are separate)
    if (parentSpan) {
      parentSpan.setAttributes({
        [`feature_flag.${key.replace(/\./g, '_')}`]: String(value),
      });
    }
    
    return value;
  } catch (error) {
    // Add error info to parent span
    if (parentSpan) {
      parentSpan.recordException(error);
      parentSpan.setAttribute(`feature_flag.${key.replace(/\./g, '_')}.error`, true);
    }
    console.error(`[OpenFeature] Error getting feature flag ${key}:`, error);
    if (logger) {
      logger.logError(error, { 
        context: 'feature_flag_evaluation', 
        flag_key: key, 
        default_value: defaultValue 
      });
    }
    return defaultValue;
  }
}

module.exports = {
  initializeOpenFeature,
  getFeatureFlag,
  OpenFeature,
};

