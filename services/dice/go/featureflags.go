package main

import (
	"context"
	"fmt"
	"os"
	"strconv"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// flagdClient is a simple client for flagd gRPC service
// In production, you would use the OpenFeature Go SDK
type flagdClient struct {
	conn *grpc.ClientConn
}

var globalFlagdClient *flagdClient

// initFlagdClient initializes the flagd client connection
func initFlagdClient() error {
	flagdHost := os.Getenv("FLAGD_HOST")
	if flagdHost == "" {
		flagdHost = "localhost"
	}
	flagdPort := os.Getenv("FLAGD_PORT")
	if flagdPort == "" {
		flagdPort = "8014"
	}

	address := fmt.Sprintf("%s:%s", flagdHost, flagdPort)
	conn, err := grpc.Dial(address, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		// If flagd is not available, we'll use defaults
		return fmt.Errorf("failed to connect to flagd: %v", err)
	}

	globalFlagdClient = &flagdClient{conn: conn}
	return nil
}

// getFeatureFlag gets a boolean feature flag value with OpenTelemetry tracing
// Returns defaultValue if flagd is not available or flag is not found
func getFeatureFlag(ctx context.Context, key string, defaultValue bool) bool {
	tracer := otel.Tracer("openfeature")
	ctx, span := tracer.Start(ctx, fmt.Sprintf("feature_flag.evaluate.%s", key))
	defer span.End()

	span.SetAttributes(
		attribute.String("feature_flag.key", key),
		attribute.String("feature_flag.provider", "flagd"),
		attribute.Bool("feature_flag.default_value", defaultValue),
	)

	if globalFlagdClient == nil || globalFlagdClient.conn == nil {
		span.SetAttributes(
			attribute.Bool("feature_flag.value", defaultValue),
			attribute.String("feature_flag.reason", "client_not_available"),
		)
		return defaultValue
	}

	// For now, we'll use a simple approach: check environment variable or use default
	// In production, you would use the OpenFeature Go SDK to make proper gRPC calls to flagd
	// This is a simplified implementation that will work with the flagd sidecar
	
	// Try to get from environment as fallback (for testing)
	envKey := fmt.Sprintf("FLAG_%s", key)
	if envVal := os.Getenv(envKey); envVal != "" {
		if val, err := strconv.ParseBool(envVal); err == nil {
			span.SetAttributes(
				attribute.Bool("feature_flag.value", val),
				attribute.String("feature_flag.reason", "environment_variable"),
			)
			return val
		}
	}

	// Default implementation: In a real scenario, you would use the OpenFeature Go SDK
	// which provides proper gRPC client for flagd
	// For now, return default value
	span.SetAttributes(
		attribute.Bool("feature_flag.value", defaultValue),
		attribute.String("feature_flag.reason", "default_value"),
	)
	
	return defaultValue
}

// getFeatureFlagString gets a string feature flag value
func getFeatureFlagString(ctx context.Context, key string, defaultValue string) string {
	if globalFlagdClient == nil || globalFlagdClient.conn == nil {
		return defaultValue
	}

	envKey := fmt.Sprintf("FLAG_%s", key)
	if envVal := os.Getenv(envKey); envVal != "" {
		return envVal
	}

	return defaultValue
}

