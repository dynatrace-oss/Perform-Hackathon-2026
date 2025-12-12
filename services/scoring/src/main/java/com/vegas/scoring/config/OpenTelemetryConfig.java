package com.vegas.scoring.config;

import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import io.opentelemetry.semconv.ResourceAttributes;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenTelemetryConfig {

    @Value("${otel.service.name:vegas-scoring-service}")
    private String serviceName;

    @Value("${otel.service.version:2.1.0}")
    private String serviceVersion;

    @Value("${otel.exporter.otlp.endpoint:localhost:4317}")
    private String otlpEndpoint;

    @Bean
    public OpenTelemetry openTelemetry() {
        // Always create our own OpenTelemetry instance with OTLP exporter
        // Even if GlobalOpenTelemetry is set, we need our own tracer provider for manual spans
        
        Resource resource = Resource.getDefault()
                .merge(Resource.create(Attributes.of(
                        ResourceAttributes.SERVICE_NAME, serviceName,
                        ResourceAttributes.SERVICE_VERSION, serviceVersion,
                        ResourceAttributes.SERVICE_NAMESPACE, "vegas-casino",
                        ResourceAttributes.DEPLOYMENT_ENVIRONMENT, "production"
                )));

        // Format endpoint for gRPC
        // Java SDK requires http:// or https:// prefix even for gRPC
        // Read from environment variable first, then fall back to property
        String endpoint = System.getenv("OTEL_EXPORTER_OTLP_ENDPOINT");
        if (endpoint == null || endpoint.isEmpty()) {
            endpoint = otlpEndpoint;
        }
        
        String insecureEnv = System.getenv("OTEL_EXPORTER_OTLP_INSECURE");
        boolean insecure = "true".equalsIgnoreCase(insecureEnv) || "1".equals(insecureEnv);
        
        // Remove any existing scheme
        endpoint = endpoint.replace("https://", "").replace("http://", "");
        
        // If endpoint contains a path (like :4318), remove it for gRPC
        if (endpoint.contains("/")) {
            endpoint = endpoint.substring(0, endpoint.indexOf("/"));
        }
        
        // For gRPC, Java SDK requires http:// or https:// prefix
        // Use http:// for insecure connections, https:// for secure
        // ALWAYS add prefix - Java SDK validation requires it
        // Check if prefix already exists before adding
        if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
            if (insecure) {
                endpoint = "http://" + endpoint;
                System.setProperty("otel.exporter.otlp.insecure", "true");
            } else {
                endpoint = "https://" + endpoint;
            }
        }
        
        System.out.println("OpenTelemetry Config: endpoint=" + endpoint + ", insecure=" + insecure + ", original=" + otlpEndpoint);
        
        OtlpGrpcSpanExporter spanExporter = OtlpGrpcSpanExporter.builder()
                .setEndpoint(endpoint)
                .build();

        SdkTracerProvider sdkTracerProvider = SdkTracerProvider.builder()
                .addSpanProcessor(BatchSpanProcessor.builder(spanExporter).build())
                .setResource(resource)
                .build();

        // Create OpenTelemetry SDK instance
        OpenTelemetrySdk sdk = OpenTelemetrySdk.builder()
                .setTracerProvider(sdkTracerProvider)
                .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
                .build();
        
        // Try to register globally, but don't fail if already set
        try {
            GlobalOpenTelemetry.set(sdk);
            System.out.println("OpenTelemetry SDK registered globally with OTLP exporter");
        } catch (IllegalStateException e) {
            // GlobalOpenTelemetry is already set (e.g., by Dynatrace operator)
            // We still return our SDK instance so manual spans use our exporter
            System.out.println("GlobalOpenTelemetry already set, using our SDK instance for manual spans");
        }
        
        return sdk;
    }

    @Bean
    public io.opentelemetry.api.trace.Tracer tracer(OpenTelemetry openTelemetry) {
        // Use the OpenTelemetry instance we created (with OTLP exporter) instead of GlobalOpenTelemetry
        // This ensures manual spans are exported via our configured exporter
        return openTelemetry.getTracer(serviceName);
    }
}

