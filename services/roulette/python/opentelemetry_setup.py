"""
OpenTelemetry Setup for Python Services
Uses semantic conventions for standard attributes
"""

import os
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.semconv.resource import ResourceAttributes
from opentelemetry.propagate import set_global_textmap
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator


def initialize_telemetry(service_name, service_metadata=None):
    """Initialize OpenTelemetry for Python service"""
    if service_metadata is None:
        service_metadata = {}

    # Create resource with semantic conventions
    resource = Resource.create({
        ResourceAttributes.SERVICE_NAME: service_name,
        ResourceAttributes.SERVICE_NAMESPACE: os.getenv("SERVICE_NAMESPACE", "vegas-casino"),
        ResourceAttributes.SERVICE_VERSION: os.getenv("SERVICE_VERSION", service_metadata.get("version", "2.1.0")),
        ResourceAttributes.SERVICE_INSTANCE_ID: os.getenv("SERVICE_INSTANCE_ID", f"{service_name}-{os.getpid()}"),
        ResourceAttributes.DEPLOYMENT_ENVIRONMENT: os.getenv("DEPLOYMENT_ENVIRONMENT", "production"),
        # Game attributes
        "game.category": os.getenv("GAME_CATEGORY", service_metadata.get("gameCategory", "unknown")),
        "game.type": os.getenv("GAME_TYPE", service_metadata.get("gameType", "unknown")),
        "game.complexity": os.getenv("GAME_COMPLEXITY", service_metadata.get("complexity", "medium")),
        "game.rtp": os.getenv("GAME_RTP", service_metadata.get("rtp", "variable")),
        "game.max_payout": os.getenv("GAME_MAX_PAYOUT", service_metadata.get("maxPayout", "1x")),
        "game.owner": os.getenv("GAME_OWNER", service_metadata.get("owner", "Vegas-Casino-Team")),
        "game.technology": os.getenv("GAME_TECHNOLOGY", "Python"),
    })

    # Create tracer provider
    provider = TracerProvider(resource=resource)

    # Add OTLP gRPC exporter
    # Use insecure connection (no TLS) for plain gRPC endpoints
    otlp_endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317")
    # Set environment variable to disable TLS (OTEL_EXPORTER_OTLP_INSECURE=true)
    # This is the standard way to configure insecure gRPC connections in OpenTelemetry Python
    os.environ.setdefault("OTEL_EXPORTER_OTLP_INSECURE", "true")
    # OTLPSpanExporter will use insecure connection based on environment variable
    otlp_exporter = OTLPSpanExporter(endpoint=otlp_endpoint)
    provider.add_span_processor(BatchSpanProcessor(otlp_exporter))

    # Set global tracer provider
    trace.set_tracer_provider(provider)
    
    # Configure W3C TraceContext propagator for trace context propagation
    set_global_textmap(TraceContextTextMapPropagator())

    return trace.get_tracer(service_name)


def add_game_attributes(span, attributes):
    """Add game attributes to span"""
    for key, value in attributes.items():
        span.set_attribute(f"game.{key}", value)


def add_http_attributes(span, method, path, status_code=None):
    """Add HTTP semantic convention attributes"""
    span.set_attribute("http.method", method)
    span.set_attribute("http.route", path)
    if status_code:
        span.set_attribute("http.status_code", status_code)

