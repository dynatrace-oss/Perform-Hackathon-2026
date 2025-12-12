package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var scoringServiceURL = getEnv("SCORING_SERVICE_URL", "http://localhost:8085")

type GameResultRequest struct {
	Username string  `json:"username"`
	Game     string  `json:"game"`
	Action   string  `json:"action"`
	BetAmount float64 `json:"betAmount"`
	Payout   float64 `json:"payout"`
	Win      bool    `json:"win"`
	Result   string  `json:"result"`
	GameData string  `json:"gameData,omitempty"`
	Metadata string  `json:"metadata,omitempty"`
}

// recordGameResult records a game result in the scoring service
func recordGameResult(ctx context.Context, gameResult GameResultRequest) error {
	// Create HTTP client with timeout that respects context timeout
	// Use context timeout if available, otherwise use 15 seconds
	timeout := 15 * time.Second
	if deadline, ok := ctx.Deadline(); ok {
		timeout = time.Until(deadline)
		if timeout < 0 {
			return fmt.Errorf("context deadline exceeded")
		}
	}
	
	client := &http.Client{
		Timeout: timeout,
	}

	// Prepare request body
	jsonData, err := json.Marshal(gameResult)
	if err != nil {
		return fmt.Errorf("failed to marshal game result: %v", err)
	}

	// Create request
	url := fmt.Sprintf("%s/api/scoring/game-result", scoringServiceURL)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Send request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %v", err)
	}
	defer resp.Body.Close()

	// Read response body (even if we don't use it)
	_, _ = io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("scoring service returned status %d", resp.StatusCode)
	}

	return nil
}

// recordGameResultAsync records a game result asynchronously (non-blocking)
// Uses a new context with timeout instead of the parent context to avoid cancellation
func recordGameResultAsync(ctx context.Context, gameResult GameResultRequest) {
	go func() {
		// Create a new context with timeout for the async call
		// This prevents the context from being canceled when the parent request completes
		asyncCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		
		if err := recordGameResult(asyncCtx, gameResult); err != nil {
			fmt.Printf("Warning: Failed to record game result: %v\n", err)
		}
	}()
}

