package main

import (
	"context"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"os"
)

// Initialize OpenTelemetry for Go service
func initTelemetry(serviceName string, serviceMetadata map[string]string) (*sdktrace.TracerProvider, error) {
	// Create resource with semantic conventions
	res, err := resource.New(context.Background(),
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceNamespaceKey.String(getEnv("SERVICE_NAMESPACE", "vegas-casino")),
			semconv.ServiceVersionKey.String(getEnv("SERVICE_VERSION", serviceMetadata["version"])),
			semconv.ServiceInstanceIDKey.String(getEnv("SERVICE_INSTANCE_ID", serviceName+"-"+os.Getenv("HOSTNAME"))),
			semconv.DeploymentEnvironmentKey.String(getEnv("DEPLOYMENT_ENVIRONMENT", "production")),
			// Game attributes
			attribute.String("game.category", getEnv("GAME_CATEGORY", serviceMetadata["gameCategory"])),
			attribute.String("game.type", getEnv("GAME_TYPE", serviceMetadata["gameType"])),
			attribute.String("game.complexity", getEnv("GAME_COMPLEXITY", serviceMetadata["complexity"])),
			attribute.String("game.rtp", getEnv("GAME_RTP", serviceMetadata["rtp"])),
			attribute.String("game.max_payout", getEnv("GAME_MAX_PAYOUT", serviceMetadata["maxPayout"])),
			attribute.String("game.owner", getEnv("GAME_OWNER", serviceMetadata["owner"])),
			attribute.String("game.technology", getEnv("GAME_TECHNOLOGY", "Go")),
		),
	)
	if err != nil {
		return nil, err
	}

	// Create OTLP gRPC exporter
	// Use insecure connection (no TLS) for plain gRPC endpoints
	exporter, err := otlptracegrpc.New(context.Background(),
		otlptracegrpc.WithEndpoint(getEnv("OTEL_EXPORTER_OTLP_ENDPOINT", "localhost:4317")),
		otlptracegrpc.WithInsecure(), // Disable TLS for plain gRPC
	)
	if err != nil {
		return nil, err
	}

	// Create tracer provider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exporter),
		sdktrace.WithResource(res),
	)

	// Set global tracer provider
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp, nil
}

// Helper to get environment variable with default
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// Add game attributes to span
func addGameAttributes(span trace.Span, attributes map[string]interface{}) {
	for key, value := range attributes {
		switch v := value.(type) {
		case string:
			span.SetAttributes(attribute.String("game."+key, v))
		case int:
			span.SetAttributes(attribute.Int("game."+key, v))
		case int64:
			span.SetAttributes(attribute.Int64("game."+key, v))
		case float64:
			span.SetAttributes(attribute.Float64("game."+key, v))
		case bool:
			span.SetAttributes(attribute.Bool("game."+key, v))
		}
	}
}

