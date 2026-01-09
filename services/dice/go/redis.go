package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var redisClient *redis.Client

// InitializeRedis initializes the Redis client
func InitializeRedis() {
	redisHost := getEnvOrDefault("REDIS_HOST", "localhost")
	redisPort := getEnvOrDefault("REDIS_PORT", "6379")
	redisPassword := getEnvOrDefault("REDIS_PASSWORD", "")

	// Construct address from host and port
	redisAddr := fmt.Sprintf("%s:%s", redisHost, redisPort)

	redisClient = redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: redisPassword,
		DB:       0,
	})

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Printf("Warning: Failed to connect to Redis: %v. Game state will not be persisted.", err)
		redisClient = nil
	} else {
		log.Printf("✅ Connected to Redis at %s", redisAddr)
	}
}

// GameState represents the state of a dice game
type GameState struct {
	LastRoll         time.Time `json:"last_roll"`
	Dice1            int       `json:"dice1"`
	Dice2            int       `json:"dice2"`
	Sum              int       `json:"sum"`
	Win              bool      `json:"win"`
	Payout           float64   `json:"payout"`
	BetAmount        float64   `json:"bet_amount"`
	BetType          string    `json:"bet_type"`
	PayoutMultiplier float64   `json:"payout_multiplier"`
}

const (
	gameStateKeyPrefix = "dice:game:"
	gameStateTTL       = 3600 // 1 hour
)

// GetGameState retrieves game state from Redis
func GetGameState(ctx context.Context, username string) (*GameState, error) {
	if redisClient == nil {
		return nil, fmt.Errorf("Redis client not initialized")
	}

	key := gameStateKeyPrefix + username
	val, err := redisClient.Get(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil // No state found
	}
	if err != nil {
		return nil, fmt.Errorf("error getting game state from Redis: %w", err)
	}

	var state GameState
	if err := json.Unmarshal([]byte(val), &state); err != nil {
		return nil, fmt.Errorf("error parsing game state: %w", err)
	}

	return &state, nil
}

// SaveGameState saves game state to Redis
func SaveGameState(ctx context.Context, username string, state *GameState) error {
	if redisClient == nil {
		return nil // Silently fail if Redis is not available
	}

	key := gameStateKeyPrefix + username
	stateJSON, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("error marshaling game state: %w", err)
	}

	err = redisClient.Set(ctx, key, stateJSON, gameStateTTL*time.Second).Err()
	if err != nil {
		return fmt.Errorf("error saving game state to Redis: %w", err)
	}

	return nil
}

// DeleteGameState deletes game state from Redis
func DeleteGameState(ctx context.Context, username string) error {
	if redisClient == nil {
		return nil // Silently fail if Redis is not available
	}

	key := gameStateKeyPrefix + username
	err := redisClient.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("error deleting game state from Redis: %w", err)
	}

	return nil
}

func getEnvOrDefault(key, defaultValue string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultValue
}
