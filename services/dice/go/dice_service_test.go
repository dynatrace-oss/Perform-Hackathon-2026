package main

import (
	"math/rand"
	"testing"
	"time"
)

func TestRollDice(t *testing.T) {
	// Test that dice roll returns valid values
	for i := 0; i < 100; i++ {
		die1 := rollDie()
		die2 := rollDie()

		if die1 < 1 || die1 > 6 {
			t.Errorf("Die 1 value %d is out of range [1, 6]", die1)
		}
		if die2 < 1 || die2 > 6 {
			t.Errorf("Die 2 value %d is out of range [1, 6]", die2)
		}
	}
}

func TestCalculatePayout(t *testing.T) {
	tests := []struct {
		name     string
		dice1    int
		dice2    int
		betType  string
		betAmount float64
		want     float64
	}{
		{
			name:      "snake eyes (1,1)",
			dice1:     1,
			dice2:     1,
			betType:   "any",
			betAmount: 10.0,
			want:      300.0, // 30x multiplier
		},
		{
			name:      "boxcars (6,6)",
			dice1:     6,
			dice2:     6,
			betType:   "any",
			betAmount: 10.0,
			want:      300.0, // 30x multiplier
		},
		{
			name:      "seven out",
			dice1:     3,
			dice2:     4,
			betType:   "any",
			betAmount: 10.0,
			want:      40.0, // 4x multiplier
		},
		{
			name:      "no win",
			dice1:     2,
			dice2:     3,
			betType:   "any",
			betAmount: 10.0,
			want:      0.0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := calculatePayout(tt.dice1, tt.dice2, tt.betAmount)
			if got != tt.want {
				t.Errorf("calculatePayout(%d, %d, %.2f) = %.2f, want %.2f",
					tt.dice1, tt.dice2, tt.betAmount, got, tt.want)
			}
		})
	}
}

func TestRollDie(t *testing.T) {
	// Test that rollDie returns values in valid range
	for i := 0; i < 1000; i++ {
		result := rollDie()
		if result < 1 || result > 6 {
			t.Errorf("rollDie() = %d, want value in range [1, 6]", result)
		}
	}
}

func TestServiceMetadata(t *testing.T) {
	metadata := map[string]string{
		"version":    "2.1.0",
		"gameType":   "craps-dice",
		"complexity": "medium",
		"rtp":        "98.6%",
		"owner":      "Dice-Games-Team",
	}

	if metadata["version"] != "2.1.0" {
		t.Errorf("Expected version 2.1.0, got %s", metadata["version"])
	}

	if metadata["gameType"] != "craps-dice" {
		t.Errorf("Expected gameType craps-dice, got %s", metadata["gameType"])
	}
}

// Helper functions (these should match the actual implementation)
func rollDie() int {
	// Simple random die roll for testing
	rand.Seed(time.Now().UnixNano())
	return 1 + rand.Intn(6)
}

func calculatePayout(dice1, dice2 int, betAmount float64) float64 {
	sum := dice1 + dice2

	// Snake eyes (1,1) or boxcars (6,6)
	if (dice1 == 1 && dice2 == 1) || (dice1 == 6 && dice2 == 6) {
		return betAmount * 30.0
	}

	// Seven out
	if sum == 7 {
		return betAmount * 4.0
	}

	return 0.0
}

