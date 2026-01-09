/**
 * Browser-side OpenTelemetry Instrumentation
 * Initializes OpenTelemetry Web SDK and creates spans for user actions
 * Propagates trace context via HTTP headers to frontend-service
 */

(function() {
  'use strict';

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
    
    return span;
  };

  // Helper function to end a span
  window.endSpan = function(span, status = 'ok') {
    if (span && span.end) {
      if (status === 'error') {
        span.setStatus({ code: 2 }); // ERROR
      } else {
        span.setStatus({ code: 1 }); // OK
      }
      span.end();
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
