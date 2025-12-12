/**
 * Browser-side OpenTelemetry Instrumentation
 * Provides tracing for frontend user actions
 */

(function() {
  'use strict';

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
    return span;
  };

  // Helper function to end a span
  window.endSpan = function(span, status = 'ok') {
    if (span) {
      if (status === 'error') {
        span.setStatus({ code: 2 }); // ERROR
      } else {
        span.setStatus({ code: 1 }); // OK
      }
      span.end();
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




