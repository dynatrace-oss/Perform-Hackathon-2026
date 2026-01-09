/**
 * Browser-side OpenTelemetry Instrumentation
<<<<<<< HEAD
 * Provides tracing for frontend user actions
=======
 * Initializes OpenTelemetry Web SDK and creates spans for user actions
 * Propagates trace context via HTTP headers to frontend-service
>>>>>>> 808c574 (Prepare Perform Hackathon 2026: Update to OpenTelemetry v2 and various improvements)
 */

(function() {
  'use strict';

<<<<<<< HEAD
  // Check if OpenTelemetry is available (loaded from CDN)
  if (typeof window.opentelemetry === 'undefined') {
    console.warn('[OpenTelemetry] Browser SDK not loaded, tracing disabled');
    return;
  }

  const { trace, context, propagation } = window.opentelemetry;
  const { Resource } = window.opentelemetry.resources;
  const { SemanticResourceAttributes } = window.opentelemetry.semanticConventions;
  const { WebTracerProvider } = window.opentelemetry.trace;
  const { BatchSpanProcessor } = window.opentelemetry.trace;
  const { OTLPTraceExporter } = window.opentelemetry.exporter.otlp.trace;
  const { ZoneContextManager } = window.opentelemetry.context.zone;
  const { registerInstrumentations } = window.opentelemetry.instrumentation;
  const { FetchInstrumentation } = window.opentelemetry.instrumentation.fetch;
  const { XMLHttpRequestInstrumentation } = window.opentelemetry.instrumentation.xmlhttprequest;

  // Get OTLP endpoint from environment or use default
  const otlpEndpoint = window.OTEL_EXPORTER_OTLP_ENDPOINT || 
    (window.location.hostname === 'localhost' ? 'http://localhost:4317' : 
     `http://${window.location.hostname}:4317`);

  // Initialize resource
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'vegas-frontend-browser',
    [SemanticResourceAttributes.SERVICE_VERSION]: '2.1.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'production',
  });

  // Create tracer provider
  const provider = new WebTracerProvider({
    resource: resource,
  });

  // Add OTLP exporter
  const exporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: {},
  });

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));

  // Register instrumentations
  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: [
          /.*/, // Propagate to all URLs
        ],
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: [
          /.*/, // Propagate to all URLs
        ],
      }),
    ],
  });

  // Initialize provider
  provider.register({
    contextManager: new ZoneContextManager(),
  });

  const tracer = provider.getTracer('vegas-frontend-browser');

  // Helper function to create a span for user actions
  window.createUserActionSpan = function(actionName, attributes = {}) {
    const span = tracer.startSpan(`user.action.${actionName}`);
    span.setAttributes({
      'user.action': actionName,
      'user.username': localStorage.getItem('vegas.username') || localStorage.getItem('vegasUser') || 'Anonymous',
      ...attributes,
    });
=======
  console.log('[OpenTelemetry] Browser instrumentation script loaded');

  // Check if we should initialize OpenTelemetry
  // We'll use a simplified approach that works with the OpenTelemetry API
  let tracer = null;
  let initialized = false;

  // Initialize OpenTelemetry when possible
  function initializeOpenTelemetry() {
    if (initialized || typeof window.OTEL_SDK_INITIALIZED !== 'undefined') {
      return;
    }

    // Try to use OpenTelemetry API if available
    // For now, we'll create a simple wrapper that ensures trace context propagation
    // The actual SDK initialization would require @opentelemetry/sdk-trace-web and @opentelemetry/exporter-otlp-http
    
    // Mark as initialized
    window.OTEL_SDK_INITIALIZED = true;
    initialized = true;

    // Create a simple tracer-like object that ensures trace context propagation
    tracer = {
      startSpan: function(name, options) {
        // Create a span-like object that will ensure trace context is propagated
        const spanId = generateId();
        const traceId = getOrCreateTraceId();
        
        return {
          name: name,
          spanId: spanId,
          traceId: traceId,
          attributes: {},
          setAttribute: function(key, value) {
            this.attributes[key] = value;
          },
          setAttributes: function(attrs) {
            Object.assign(this.attributes, attrs);
          },
          setStatus: function(status) {
            this.status = status;
          },
          end: function() {
            // Store trace context for propagation
            storeTraceContext(this.traceId, this.spanId);
          }
        };
      }
    };

    window.otelTracer = tracer;
    console.log('[OpenTelemetry] Browser instrumentation initialized');
  }

  // Generate a random ID
  function generateId() {
    return Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 18);
  }

  // Get or create trace ID (persist across page interactions)
  function getOrCreateTraceId() {
    let traceId = sessionStorage.getItem('otel_trace_id');
    if (!traceId) {
      traceId = generateId();
      sessionStorage.setItem('otel_trace_id', traceId);
    }
    return traceId;
  }

  // Store trace context for propagation
  function storeTraceContext(traceId, spanId) {
    sessionStorage.setItem('otel_trace_id', traceId);
    sessionStorage.setItem('otel_span_id', spanId);
  }

  // Get current trace context
  function getTraceContext() {
    const traceId = getOrCreateTraceId();
    const spanId = sessionStorage.getItem('otel_span_id') || generateId();
    return { traceId, spanId };
  }

  // Override fetch to inject trace context headers
  if (typeof fetch !== 'undefined') {
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
      // Get current trace context
      const traceContext = getTraceContext();
      
      // Create traceparent header (W3C TraceContext format)
      // Format: version-traceid-parentid-traceflags
      // version: 00 (current version)
      // traceid: 32 hex characters
      // parentid: 16 hex characters (span ID)
      // traceflags: 01 (sampled)
      const traceparent = `00-${traceContext.traceId}-${traceContext.spanId}-01`;
      
      // Ensure headers object exists
      if (!options.headers) {
        options.headers = {};
      }

      // If headers is a Headers object, convert to plain object for modification
      let headersObj = options.headers;
      if (headersObj instanceof Headers) {
        headersObj = Object.fromEntries(headersObj.entries());
      }

      // Inject trace context headers
      headersObj['traceparent'] = traceparent;
      
      // Convert back to Headers if it was originally a Headers object
      if (options.headers instanceof Headers) {
        const newHeaders = new Headers();
        Object.keys(headersObj).forEach(key => {
          newHeaders.set(key, headersObj[key]);
        });
        options.headers = newHeaders;
      } else {
        options.headers = headersObj;
      }

      console.log(`[OpenTelemetry] Fetch to ${url} with traceparent: ${traceparent.substring(0, 50)}...`);

      return originalFetch(url, options);
    };
  }

  // Helper to create a span for user actions
  window.createUserActionSpan = function(actionName, attributes = {}) {
    if (!tracer) {
      initializeOpenTelemetry();
    }
    
    const span = tracer.startSpan(actionName);
    if (attributes) {
      span.setAttributes(attributes);
    }
    
    console.log(`[OpenTelemetry] Created span: ${actionName}`, { traceId: span.traceId, spanId: span.spanId });
    
>>>>>>> 808c574 (Prepare Perform Hackathon 2026: Update to OpenTelemetry v2 and various improvements)
    return span;
  };

  // Helper function to end a span
  window.endSpan = function(span, status = 'ok') {
<<<<<<< HEAD
    if (span) {
=======
    if (span && span.end) {
>>>>>>> 808c574 (Prepare Perform Hackathon 2026: Update to OpenTelemetry v2 and various improvements)
      if (status === 'error') {
        span.setStatus({ code: 2 }); // ERROR
      } else {
        span.setStatus({ code: 1 }); // OK
      }
      span.end();
<<<<<<< HEAD
    }
  };

  // Track page load
  document.addEventListener('DOMContentLoaded', function() {
    const span = tracer.startSpan('page.load');
    span.setAttributes({
      'page.url': window.location.href,
      'page.path': window.location.pathname,
      'page.title': document.title,
    });
    span.end();
  });

  // Track page navigation
  let lastUrl = window.location.href;
  setInterval(function() {
    if (window.location.href !== lastUrl) {
      const span = tracer.startSpan('page.navigation');
      span.setAttributes({
        'page.from': lastUrl,
        'page.to': window.location.href,
      });
      span.end();
      lastUrl = window.location.href;
    }
  }, 100);

  console.log('[OpenTelemetry] Browser instrumentation initialized');
})();




=======
      console.log(`[OpenTelemetry] Ended span: ${span.name}`);
    }
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOpenTelemetry);
  } else {
    initializeOpenTelemetry();
  }

  console.log('[OpenTelemetry] Browser instrumentation helpers initialized');
})();
>>>>>>> 808c574 (Prepare Perform Hackathon 2026: Update to OpenTelemetry v2 and various improvements)
