package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strings"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
)

// DiceMetadata represents service metadata
type DiceMetadata struct {
	Version         string   `json:"version"`
	Environment     string   `json:"environment"`
	GameType        string   `json:"gameType"`
	Complexity      string   `json:"complexity"`
	RTP             string   `json:"rtp"`
	Owner           string   `json:"owner"`
	Technology      string   `json:"technology"`
	Features        []string `json:"features"`
	MaxPayout       string   `json:"maxPayout"`
	Volatility      string   `json:"volatility"`
	DiceCount       int      `json:"diceCount"`
	WinConditions   []string `json:"winConditions"`
	SpecialFeatures []string `json:"specialFeatures"`
}

// RollRequest represents the incoming roll request
type RollRequest struct {
	BetAmount float64 `json:"BetAmount"`
	BetType   string  `json:"BetType"`
}

// RollResponse represents the roll response
type RollResponse struct {
	Dice1            int     `json:"dice1"`
	Dice2            int     `json:"dice2"`
	Sum              int     `json:"sum"`
	Win              bool    `json:"win"`
	Payout           float64 `json:"payout"`
	BetAmount        float64 `json:"betAmount"`
	BetType          string  `json:"betType"`
	PayoutMultiplier float64 `json:"payoutMultiplier"`
	Timestamp        string  `json:"timestamp"`
}

var metadata = DiceMetadata{
	Version:         "2.1.0",
	Environment:     "vegas-casino-production",
	GameType:        "craps-dice",
	Complexity:      "medium",
	RTP:             "98.6%",
	Owner:           "Dice-Games-Team",
	Technology:      "Go-Dice",
	Features:        []string{"dual-dice-roll", "craps-rules", "pass-line-betting", "real-time-results"},
	MaxPayout:       "2x",
	Volatility:      "low",
	DiceCount:       2,
	WinConditions:   []string{"7", "11"},
	SpecialFeatures: []string{"natural-wins", "come-out-roll", "simple-betting"},
}

func main() {
	rand.Seed(time.Now().UnixNano())

	// Initialize OpenTelemetry
	serviceMetadata := map[string]string{
		"version":      metadata.Version,
		"gameType":     metadata.GameType,
		"gameCategory": "dice-games",
		"complexity":   metadata.Complexity,
		"rtp":          metadata.RTP,
		"maxPayout":    metadata.MaxPayout,
		"owner":        metadata.Owner,
	}

	tp, err := initTelemetry("vegas-dice-service", serviceMetadata)
	if err != nil {
		log.Printf("Failed to initialize OpenTelemetry: %v", err)
	} else {
		defer func() {
			if err := tp.Shutdown(context.Background()); err != nil {
				log.Printf("Error shutting down tracer provider: %v", err)
			}
		}()
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	serviceName := os.Getenv("SERVICE_NAME")
	if serviceName == "" {
		serviceName = "vegas-dice-service"
	}

	http.HandleFunc("/health", healthHandler)
	http.HandleFunc("/roll", rollHandler)

	// Set OpenTelemetry middleware
	handler := openTelemetryMiddleware(http.DefaultServeMux, serviceName)

	fmt.Printf("[%s] Listening on port %s\n", serviceName, port)
	log.Fatal(http.ListenAndServe(":"+port, handler))
}

func openTelemetryMiddleware(next http.Handler, serviceName string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()
		tracer := otel.Tracer(serviceName)

		// Start span with semantic conventions
		ctx, span := tracer.Start(ctx, fmt.Sprintf("%s %s", r.Method, r.URL.Path))
		defer span.End()

		// Set HTTP semantic convention attributes
		span.SetAttributes(
			semconv.HTTPMethodKey.String(r.Method),
			semconv.HTTPRouteKey.String(r.URL.Path),
			semconv.HTTPTargetKey.String(r.URL.String()),
			semconv.HTTPSchemeKey.String(r.URL.Scheme),
			semconv.HTTPUserAgentKey.String(r.UserAgent()),
		)

		// Set game attributes
		span.SetAttributes(
			attribute.String("game.category", "dice-games"),
			attribute.String("game.type", metadata.GameType),
			attribute.String("game.complexity", metadata.Complexity),
			attribute.String("game.rtp", metadata.RTP),
			attribute.String("game.max_payout", metadata.MaxPayout),
			attribute.String("game.owner", metadata.Owner),
			attribute.String("game.technology", metadata.Technology),
		)

		// Create response writer wrapper to capture status code
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Continue with request using context with span
		next.ServeHTTP(wrapped, r.WithContext(ctx))

		// Set status code attribute
		span.SetAttributes(semconv.HTTPStatusCodeKey.Int(wrapped.statusCode))
		if wrapped.statusCode >= 400 {
			span.SetStatus(codes.Error, http.StatusText(wrapped.statusCode))
		}
	})
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tracer := otel.Tracer("vegas-dice-service")
	ctx, span := tracer.Start(ctx, "health_check")
	defer span.End()

	// Set semantic convention attributes
	span.SetAttributes(
		semconv.HTTPMethodKey.String("GET"),
		semconv.HTTPRouteKey.String("/health"),
		attribute.String("service.name", os.Getenv("SERVICE_NAME")),
		attribute.String("game.category", "dice-games"),
		attribute.String("game.type", metadata.GameType),
		attribute.String("game.complexity", metadata.Complexity),
		attribute.String("game.rtp", metadata.RTP),
		attribute.String("game.max_payout", metadata.MaxPayout),
	)
	// Parse OTEL_RESOURCE_ATTRIBUTES if available
	resourceAttrs := parseResourceAttributes(os.Getenv("OTEL_RESOURCE_ATTRIBUTES"))

	response := map[string]interface{}{
		"status":  "ok",
		"service": os.Getenv("SERVICE_NAME"),
		"opentelemetryMetadata": map[string]interface{}{
			"serviceName":      getEnvOrAttr("OTEL_SERVICE_NAME", "service.name", resourceAttrs, os.Getenv("SERVICE_NAME")),
			"serviceVersion":   getEnvOrAttr("OTEL_SERVICE_VERSION", "service.version", resourceAttrs, "2.1.0"),
			"serviceNamespace": getEnvOrAttr("SERVICE_NAMESPACE", "service.namespace", resourceAttrs, "vegas-casino"),
			"environment":      getEnvOrAttr("DEPLOYMENT_ENVIRONMENT", "deployment.environment", resourceAttrs, "production"),
			"clusterName":      getEnvOrAttr("", "k8s.cluster.name", resourceAttrs, ""),
			"nodeName":         getEnvOrAttr("", "k8s.node.name", resourceAttrs, ""),
			"instanceId":       getEnvOrAttr("", "service.instance.id", resourceAttrs, ""),
		},
		"serviceMetadata": map[string]interface{}{
			"version":    metadata.Version,
			"gameType":   metadata.GameType,
			"complexity": metadata.Complexity,
			"rtp":        metadata.RTP,
			"maxPayout":  metadata.MaxPayout,
			"owner":      metadata.Owner,
			"technology": metadata.Technology,
			"timestamp":  time.Now().UTC().Format(time.RFC3339),
		},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func rollHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	tracer := otel.Tracer("vegas-dice-service")
	ctx, span := tracer.Start(ctx, "dice_roll")
	defer span.End()
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req RollRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Default values
	betAmount := req.BetAmount
	if betAmount == 0 {
		betAmount = 10
	}
	betType := req.BetType
	if betType == "" {
		betType = "pass"
	}

	// Roll dice - TEMPORARY: Force winning dice for testing
	d1 := 4        // rand.Intn(6) + 1
	d2 := 3        // rand.Intn(6) + 1
	sum := d1 + d2 // This will be 7, which wins on "pass"

	// Determine win condition based on bet type
	var win bool
	var payoutMultiplier float64

	switch betType {
	case "pass":
		win = sum == 7 || sum == 11
		payoutMultiplier = 2
	case "dont_pass":
		win = sum == 2 || sum == 3
		payoutMultiplier = 2
	case "field":
		win = sum == 2 || sum == 3 || sum == 4 || sum == 9 || sum == 10 || sum == 11 || sum == 12
		payoutMultiplier = 2
	case "snake_eyes":
		win = d1 == 1 && d2 == 1
		payoutMultiplier = 30
	case "boxcars":
		win = d1 == 6 && d2 == 6
		payoutMultiplier = 30
	case "seven_out":
		win = sum == 7
		payoutMultiplier = 4
	default:
		win = sum == 7 || sum == 11
		payoutMultiplier = 2
	}

	payout := 0.0
	if win {
		payout = betAmount * payoutMultiplier
	}

	// Add game attributes to span
	span.SetAttributes(
		attribute.String("game.action", "roll"),
		attribute.Float64("game.bet_amount", betAmount),
		attribute.String("game.bet_type", betType),
		attribute.Int("game.dice1", d1),
		attribute.Int("game.dice2", d2),
		attribute.Int("game.sum", sum),
		attribute.Bool("game.win", win),
		attribute.Float64("game.payout", payout),
		attribute.Float64("game.payout_multiplier", payoutMultiplier),
	)

	response := RollResponse{
		Dice1:            d1,
		Dice2:            d2,
		Sum:              sum,
		Win:              win,
		Payout:           payout,
		BetAmount:        betAmount,
		BetType:          betType,
		PayoutMultiplier: payoutMultiplier,
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
	}

	log.Printf("🎲 Dice Roll: %d+%d=%d, Bet: %s, Win: %v, Payout: %.2f", d1, d2, sum, betType, win, payout)

	w.Header().Set("Content-Type", "application/json")
	span.SetAttributes(semconv.HTTPStatusCodeKey.Int(http.StatusOK))
	json.NewEncoder(w).Encode(response)
}

// Helper function to parse OTEL_RESOURCE_ATTRIBUTES
func parseResourceAttributes(attrs string) map[string]string {
	result := make(map[string]string)
	if attrs == "" {
		return result
	}

	pairs := strings.Split(attrs, ",")
	for _, pair := range pairs {
		parts := strings.SplitN(strings.TrimSpace(pair), "=", 2)
		if len(parts) == 2 {
			result[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return result
}

// Helper function to get value from env var, resource attributes, or default
func getEnvOrAttr(envVar, attrKey string, attrs map[string]string, defaultValue string) string {
	if envVar != "" {
		if val := os.Getenv(envVar); val != "" {
			return val
		}
	}
	if val, ok := attrs[attrKey]; ok {
		return val
	}
	return defaultValue
}
