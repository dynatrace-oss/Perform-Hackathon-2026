package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/reflection"

	pb "vegas-dice-service/proto"
)

// metadataTextMapCarrier adapts gRPC metadata to OpenTelemetry text map carrier
type metadataTextMapCarrier metadata.MD

func (m metadataTextMapCarrier) Get(key string) string {
	values := metadata.MD(m).Get(key)
	if len(values) > 0 {
		return values[0]
	}
	return ""
}

func (m metadataTextMapCarrier) Set(key, value string) {
	metadata.MD(m).Set(key, value)
}

func (m metadataTextMapCarrier) Keys() []string {
	keys := make([]string, 0, len(metadata.MD(m)))
	for k := range metadata.MD(m) {
		keys = append(keys, k)
	}
	return keys
}

type diceServer struct {
	pb.UnimplementedDiceServiceServer
}

func (s *diceServer) Health(ctx context.Context, req *pb.HealthRequest) (*pb.HealthResponse, error) {
	serviceName := os.Getenv("SERVICE_NAME")
	if serviceName == "" {
		serviceName = "vegas-dice-service"
	}

	metadata := map[string]string{
		"version":    "2.1.0",
		"gameType":   "craps-dice",
		"complexity": "medium",
		"rtp":        "98.6%",
		"owner":      "Dice-Games-Team",
		"technology": "Go-Dice-gRPC",
	}

	return &pb.HealthResponse{
		Status:   "ok",
		Service:  serviceName,
		Metadata: metadata,
	}, nil
}

func (s *diceServer) Roll(ctx context.Context, req *pb.RollRequest) (*pb.RollResponse, error) {
	tracer := otel.Tracer("vegas-dice-service")
	ctx, span := tracer.Start(ctx, "dice_roll")
	defer span.End()

	betAmount := req.BetAmount
	if betAmount == 0 {
		betAmount = 10
	}

	betType := req.BetType
	if betType == "" {
		betType = "pass"
	}

	// Get feature flags
	passLineEnabled := getFeatureFlag(ctx, "dice.pass-line", true)
	comeBetsEnabled := getFeatureFlag(ctx, "dice.come-bets", true)
	houseAdvantageEnabled := getFeatureFlag(ctx, "casino.house-advantage", false)

	span.SetAttributes(
		attribute.Bool("feature_flag.pass_line", passLineEnabled),
		attribute.Bool("feature_flag.come_bets", comeBetsEnabled),
		attribute.Bool("feature_flag.house_advantage", houseAdvantageEnabled),
	)

	// Validate bet type against feature flags
	if betType == "pass" && !passLineEnabled {
		span.SetAttributes(
			attribute.Bool("feature_flag.blocked", true),
			attribute.String("http.status_code", "403"),
		)
		return nil, fmt.Errorf("pass-line bets are disabled")
	}
	if betType == "come" && !comeBetsEnabled {
		span.SetAttributes(
			attribute.Bool("feature_flag.blocked", true),
			attribute.String("http.status_code", "403"),
		)
		return nil, fmt.Errorf("come bets are disabled")
	}

	// Roll dice - generate random values (1-6 for each die)
	// Note: rand.Seed should be called in main() for proper randomization
	d1 := rand.Intn(6) + 1
	d2 := rand.Intn(6) + 1
	sum := d1 + d2

	// Determine win condition
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

		// Apply house advantage feature flag if enabled
		// This reduces win probability by 25% when the casino is losing too much money
		if houseAdvantageEnabled {
			// 25% chance to convert a win into a loss (house advantage)
			if rand.Float64() < 0.25 {
				win = false
				payout = 0.0
				log.Printf("[Dice] 🏠 House advantage applied: win converted to loss")
			}
		}
	}

	// Get username from request (if available in player_info)
	username := "Anonymous"
	if req.PlayerInfo != nil {
		if u, ok := req.PlayerInfo["username"]; ok {
			username = u
		}
	}

	// Store game state in Redis
	gameState := &GameState{
		LastRoll:         time.Now(),
		Dice1:            d1,
		Dice2:            d2,
		Sum:              sum,
		Win:              win,
		Payout:           payout,
		BetAmount:        betAmount,
		BetType:          betType,
		PayoutMultiplier: payoutMultiplier,
	}
	if err := SaveGameState(ctx, username, gameState); err != nil {
		log.Printf("Warning: Failed to save game state to Redis: %v", err)
	}

	// Record game result in scoring service for ALL games (wins and losses) to track total bets
	result := "lose"
	if win && payout > 0 {
		result = "win"
	}

	// Prepare game data for scoring
	gameData := map[string]interface{}{
		"dice1":   d1,
		"dice2":   d2,
		"sum":     sum,
		"betType": betType,
	}
	gameDataJSON, _ := json.Marshal(gameData)

	metadata := map[string]interface{}{
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	metadataJSON, _ := json.Marshal(metadata)

	recordGameResultAsync(ctx, GameResultRequest{
		Username:  username,
		Game:      "dice",
		Action:    "roll",
		BetAmount: betAmount,
		Payout:    payout,
		Win:       win && payout > 0,
		Result:    result,
		GameData:  string(gameDataJSON),
		Metadata:  string(metadataJSON),
	})

	// Add game attributes to span
	span.SetAttributes(
		attribute.String("game.action", "roll"),
		attribute.Float64("game.bet_amount", betAmount),
		attribute.String("game.bet_type", betType),
		attribute.Int("game.dice1", d1),
		attribute.Bool("feature_flag.house_advantage", houseAdvantageEnabled),
		attribute.Int("game.dice2", d2),
		attribute.Int("game.sum", sum),
		attribute.Bool("game.win", win),
		attribute.Float64("game.payout", payout),
		attribute.Float64("game.payout_multiplier", payoutMultiplier),
	)

	log.Printf("🎲 Dice Roll: %d+%d=%d, Bet: %s, Win: %v, Payout: %.2f", d1, d2, sum, betType, win, payout)

	return &pb.RollResponse{
		Dice1:            int32(d1),
		Dice2:            int32(d2),
		Sum:              int32(sum),
		Win:              win,
		Payout:           payout,
		BetAmount:        betAmount,
		BetType:          betType,
		PayoutMultiplier: payoutMultiplier,
		Timestamp:        time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *diceServer) GetGameAssets(ctx context.Context, req *pb.GameAssetsRequest) (*pb.GameAssetsResponse, error) {
	tracer := otel.Tracer("vegas-dice-service")
	ctx, span := tracer.Start(ctx, "get_game_assets")
	defer span.End()

	span.SetAttributes(attribute.String("game.asset_type", req.AssetType))

	// Get feature flags
	passLineEnabled := getFeatureFlag(ctx, "dice.pass-line", true)
	comeBetsEnabled := getFeatureFlag(ctx, "dice.come-bets", true)

	span.SetAttributes(
		attribute.Bool("feature_flag.pass_line", passLineEnabled),
		attribute.Bool("feature_flag.come_bets", comeBetsEnabled),
	)

	// Generate game assets
	html := generateDiceHTML()
	js := generateDiceJS(passLineEnabled, comeBetsEnabled)
	css := generateDiceCSS()

	config := map[string]string{
		"service_endpoint":  os.Getenv("SERVICE_ENDPOINT"),
		"game_name":         "Dice",
		"game_type":         "craps-dice",
		"min_bet":           "10",
		"max_bet":           "1000",
		"pass_line_enabled": strconv.FormatBool(passLineEnabled),
		"come_bets_enabled": strconv.FormatBool(comeBetsEnabled),
	}

	return &pb.GameAssetsResponse{
		Html:       html,
		Javascript: js,
		Css:        css,
		Config:     config,
	}, nil
}

func generateDiceHTML() string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dice Game</title>
    <link rel="stylesheet" href="https://cdn.tailwindcss.com">
</head>
<body class="bg-dt-dark text-white p-4">
    <div id="dice-game-container" class="max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-4 text-center">🎲 Dice Game</h1>
        <div id="dice-result" class="text-center mb-4">
            <div class="flex justify-center gap-4 mb-4">
                <div id="dice1" class="w-20 h-20 bg-dt-gray rounded-lg flex items-center justify-center text-4xl">?</div>
                <div id="dice2" class="w-20 h-20 bg-dt-gray rounded-lg flex items-center justify-center text-4xl">?</div>
            </div>
            <div id="sum" class="text-2xl font-bold"></div>
        </div>
        <div class="mb-4">
            <label class="block mb-2">Bet Type:</label>
            <select id="bet-type" class="w-full p-2 bg-dt-gray text-white rounded">
                <option value="pass" id="pass-option">Pass</option>
                <option value="dont_pass">Don't Pass</option>
                <option value="field">Field</option>
                <option value="come" id="come-option" style="display: none;">Come</option>
                <option value="snake_eyes">Snake Eyes</option>
                <option value="boxcars">Boxcars</option>
                <option value="seven_out">Seven Out</option>
            </select>
        </div>
        <div class="mb-4">
            <label class="block mb-2">Bet Amount:</label>
            <input type="number" id="bet-amount" value="10" min="10" max="1000" class="w-full p-2 bg-dt-gray text-white rounded">
        </div>
        <button id="roll-btn" class="w-full bg-dt-cyan hover:bg-dt-blue text-white font-bold py-3 px-6 rounded-lg">
            Roll Dice
        </button>
        <div id="result" class="mt-4 text-center"></div>
    </div>
    <script src="/dice-game.js"></script>
</body>
</html>`
}

func generateDiceJS(passLineEnabled, comeBetsEnabled bool) string {
	passLineStr := "true"
	if !passLineEnabled {
		passLineStr = "false"
	}
	comeBetsStr := "true"
	if !comeBetsEnabled {
		comeBetsStr = "false"
	}

	return fmt.Sprintf(`
// Dice Game JavaScript
let grpcClient;
const PASS_LINE_ENABLED = %s;
const COME_BETS_ENABLED = %s;

async function initDiceGame() {
    console.log('Initializing dice game...');
    
    // Show/hide bet options based on feature flags
    if (!PASS_LINE_ENABLED) {
        const passOption = document.getElementById('pass-option');
        if (passOption) passOption.style.display = 'none';
    }
    if (COME_BETS_ENABLED) {
        const comeOption = document.getElementById('come-option');
        if (comeOption) comeOption.style.display = 'block';
    }
    
    document.getElementById('roll-btn').addEventListener('click', async () => {
        const betAmount = parseFloat(document.getElementById('bet-amount').value);
        const betType = document.getElementById('bet-type').value;
        
        try {
            const response = await callDiceService('Roll', {
                bet_amount: betAmount,
                bet_type: betType
            });
            
            document.getElementById('dice1').textContent = response.dice1;
            document.getElementById('dice2').textContent = response.dice2;
            document.getElementById('sum').textContent = `+"`Sum: ${response.sum}`"+`;
            
            if (response.win) {
                document.getElementById('result').innerHTML = 
                    `+"`<div class=\"text-green-500 text-xl\">🎉 Win! Payout: $${response.payout.toFixed(2)}</div>`"+`;
            } else {
                document.getElementById('result').innerHTML = 
                    `+"`<div class=\"text-red-500 text-xl\">😢 No win this time</div>`"+`;
            }
        } catch (error) {
            console.error('Error rolling dice:', error);
            document.getElementById('result').innerHTML = 
                '<div class="text-red-500">Error: ' + error.message + '</div>';
        }
    });
}

async function callDiceService(method, data) {
    const response = await fetch(`+"`/api/dice/${method.toLowerCase()}`"+`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await response.json();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDiceGame);
} else {
    initDiceGame();
}
`, passLineStr, comeBetsStr)
}

func generateDiceCSS() string {
	return `
#dice-game-container {
    font-family: 'Inter', sans-serif;
}

#dice1, #dice2 {
    border: 2px solid #00D4FF;
    box-shadow: 0 0 20px rgba(0, 212, 255, 0.3);
    transition: transform 0.3s;
}

#dice1:hover, #dice2:hover {
    transform: scale(1.1);
}

#roll-btn {
    transition: all 0.3s;
}

#roll-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 212, 255, 0.4);
}

#roll-btn:active {
    transform: translateY(0);
}
`
}

func main() {
	rand.Seed(time.Now().UnixNano())

	port := os.Getenv("PORT")
	if port == "" {
		port = "8083"
	}

	grpcPort := os.Getenv("GRPC_PORT")
	if grpcPort == "" {
		grpcPort = "50053"
	}

	serviceName := os.Getenv("SERVICE_NAME")
	if serviceName == "" {
		serviceName = "vegas-dice-service"
	}

	// Initialize feature flag client
	if err := initFlagdClient(); err != nil {
		log.Printf("Warning: Failed to initialize flagd client: %v. Feature flags will use defaults.", err)
	}

	// Initialize Redis
	InitializeRedis()

	// Initialize OpenTelemetry
	serviceMetadata := map[string]string{
		"version":      "2.1.0",
		"gameType":     "craps-dice",
		"gameCategory": "dice-games",
		"complexity":   "medium",
		"rtp":          "98.6%",
		"maxPayout":    "2x",
		"owner":        "Dice-Games-Team",
	}

	tp, err := initTelemetry(serviceName, serviceMetadata)
	if err != nil {
		log.Printf("Failed to initialize OpenTelemetry: %v", err)
	} else {
		defer func() {
			if tp != nil {
				if err := tp.Shutdown(context.Background()); err != nil {
					log.Printf("Error shutting down tracer provider: %v", err)
				}
			}
		}()
	}

	// Start gRPC server
	lis, err := net.Listen("tcp", ":"+grpcPort)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	// Create gRPC server with OpenTelemetry interceptor for trace context propagation
	// The interceptor extracts trace context from gRPC metadata
	s := grpc.NewServer(
		grpc.UnaryInterceptor(func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
			// Extract trace context from gRPC metadata
			md, ok := metadata.FromIncomingContext(ctx)
			if ok {
				// Extract trace context using OpenTelemetry propagator
				prop := otel.GetTextMapPropagator()
				ctx = prop.Extract(ctx, metadataTextMapCarrier(md))
			}
			return handler(ctx, req)
		}),
	)
	pb.RegisterDiceServiceServer(s, &diceServer{})
	reflection.Register(s)

	fmt.Printf("[%s] gRPC server listening on port %s\n", serviceName, grpcPort)
	fmt.Printf("[%s] HTTP server listening on port %s\n", serviceName, port)

	// Start gRPC server in goroutine
	go func() {
		if err := s.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	// Keep HTTP server for backward compatibility
	// Start HTTP server in a goroutine
	go func() {
		http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"status":  "ok",
				"service": serviceName,
			})
		})

		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	// Wait for termination
	select {}
}
