#!/usr/bin/env python3
"""
Vegas Roulette Service - Python Implementation with gRPC Support
"""

import os
import json
import random
from datetime import datetime
from concurrent import futures
import grpc
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import sys

# Import logger
# Try to import from common directory (when running in Docker)
try:
    sys.path.insert(0, '/app/common')
    from logger import Logger
    logger = Logger(os.getenv("SERVICE_NAME", "vegas-roulette-service"))
except ImportError:
    # Fallback: try relative path (when running locally)
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../common'))
        from logger import Logger
        logger = Logger(os.getenv("SERVICE_NAME", "vegas-roulette-service"))
    except ImportError:
        logger = None

# Import Redis helper
try:
    from redis_helper import initialize_redis, save_game_state, get_game_state, delete_game_state
except ImportError:
    # Fallback: try relative import
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from redis_helper import initialize_redis, save_game_state, get_game_state, delete_game_state
    except ImportError:
        print("Warning: Redis helper not found. Game state will not be persisted.")
        def initialize_redis():
            pass
        def save_game_state(*args, **kwargs):
            return False
        def get_game_state(*args, **kwargs):
            return None
        def delete_game_state(*args, **kwargs):
            return False

# Import scoring helper
try:
    from scoring_helper import record_game_result_async
except ImportError:
    # Fallback: try relative import
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from scoring_helper import record_game_result_async
    except ImportError:
        print("Warning: Scoring helper not found. Game results will not be recorded.")
        def record_game_result_async(*args, **kwargs):
            pass

# Import feature flag helper
try:
    from featureflags import get_feature_flag
except ImportError:
    # Fallback: try relative import
    try:
        sys.path.insert(0, os.path.dirname(__file__))
        from featureflags import get_feature_flag
    except ImportError:
        print("Warning: Feature flag helper not found. Using environment variable fallback.")
        def get_feature_flag(flag_key, default_value=False):
            env_key = f"FLAG_{flag_key.replace('.', '_').upper()}"
            env_value = os.getenv(env_key, str(default_value))
            return env_value.lower() in ("true", "1", "yes")

# Import generated gRPC code
# Proto files are generated in the same directory during Docker build
try:
    import roulette_pb2
    import roulette_pb2_grpc
except ImportError:
    print("Warning: gRPC proto files not found. Proto files should be generated during Docker build.")
    roulette_pb2 = None
    roulette_pb2_grpc = None

# Import OpenTelemetry setup
try:
    from opentelemetry import trace
    from opentelemetry.propagate import extract
    from opentelemetry_setup import initialize_telemetry, add_game_attributes, add_http_attributes
    tracer = initialize_telemetry("vegas-roulette-service", {
        "version": "2.1.0",
        "gameType": "european-roulette",
        "gameCategory": "table-games",
        "complexity": "high",
        "rtp": "97.3%",
        "maxPayout": "36x",
        "owner": "Table-Games-Team",
    })
except (ImportError, NameError):
    print("Warning: OpenTelemetry not available, running without instrumentation")
    tracer = None
    extract = None

# Service metadata
METADATA = {
    "version": "2.1.0",
    "environment": "vegas-casino-production",
    "gameType": "european-roulette",
    "complexity": "high",
    "rtp": "97.3%",
    "owner": "Table-Games-Team",
    "technology": "Python-Flask-Roulette",
    "features": ["multiple-bet-types", "live-wheel", "cheat-detection", "advanced-statistics"],
    "maxPayout": "36x",
    "volatility": "medium",
    "wheelType": "37-number-european",
    "betTypes": ["straight", "split", "street", "corner", "red-black", "odd-even"],
    "specialFeatures": ["pattern-detection", "hot-cold-numbers", "betting-strategies"]
}

# Red numbers on European roulette
RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]


def get_cheat_boost_chance(cheat_type):
    """Determine cheat boost chance based on cheat type"""
    cheat_boost_chances = {
        "ballControl": 0.30,
        "wheelBias": 0.25,
        "magneticField": 0.40,
        "sectorPrediction": 0.35
    }
    return cheat_boost_chances.get(cheat_type, 0)


def get_color(number):
    """Get color for a given number"""
    if number == 0:
        return "green"
    return "red" if number in RED_NUMBERS else "black"


# gRPC Service Implementation
class RouletteServiceServicer(roulette_pb2_grpc.RouletteServiceServicer):
    def Health(self, request, context):
        service_name = os.getenv("SERVICE_NAME", "vegas-roulette-service")
        return roulette_pb2.HealthResponse(
            status="ok",
            service=service_name,
            metadata={
                "version": METADATA["version"],
                "gameType": METADATA["gameType"],
                "gameCategory": "table-games",
                "complexity": METADATA["complexity"],
                "rtp": METADATA["rtp"],
                "maxPayout": METADATA["maxPayout"],
                "owner": METADATA["owner"],
                "technology": METADATA["technology"]
            }
        )

    def Spin(self, request, context):
        # Extract trace context from gRPC metadata
        extracted_context = None
        if tracer and extract and context:
            try:
                # Extract trace context from gRPC metadata
                metadata_dict = {}
                # Python gRPC uses invocation_metadata() method
                if hasattr(context, 'invocation_metadata'):
                    for key, value in context.invocation_metadata():
                        metadata_dict[key.lower()] = value
                
                if metadata_dict:
                    extracted_context = extract(metadata_dict)
            except Exception as e:
                print(f"Warning: Failed to extract trace context: {e}")
        
        # Start span in extracted context (or active context if extraction failed)
        span = None
        if tracer:
            try:
                if extracted_context:
                    span = tracer.start_span("roulette_spin", context=extracted_context)
                else:
                    span = tracer.start_span("roulette_spin")
                add_http_attributes(span, "POST", "/spin")
            except Exception as e:
                print(f"Warning: Failed to start span with trace context: {e}")
                span = tracer.start_span("roulette_spin") if tracer else None

        bet_type = request.bet_type or "red"
        bet_amount = request.bet_amount or 10
        bet_value = request.bet_value or {}  # For multiple bets
        cheat_active = request.cheat_active
        cheat_type = request.cheat_type or ""
        
        # Extract username from player_info
        username = "Anonymous"
        if request.player_info:
            username = request.player_info.get("username", "Anonymous")

        # Check house advantage feature flag
        house_advantage_enabled = get_feature_flag("casino.house-advantage", False)
        if span:
            span.set_attribute("feature_flag.house_advantage", house_advantage_enabled)
        if house_advantage_enabled:
            print(f"[Roulette] 🏠 House advantage mode enabled - reducing win probability")

        # Log game start
        if logger:
            logger.log_game_start("roulette", username, bet_amount, {
                "action": "spin",
                "bet_type": bet_type,
                "cheat_active": cheat_active,
                "cheat_type": cheat_type
            })

        if span:
            add_game_attributes(span, {
                "action": "spin",
                "cheat_active": cheat_active,
            })
            if cheat_type:
                span.set_attribute("game.cheat_type", cheat_type)
            if username:
                span.set_attribute("user.name", username)

        winning_number = random.randint(0, 36)
        color = get_color(winning_number)
        cheat_boosted = False

        # Apply cheat logic
        if cheat_active and cheat_type:
            boost_chance = get_cheat_boost_chance(cheat_type)
            if random.random() < boost_chance:
                cheat_boosted = True
                print(f"[Roulette] ?? Cheat boosted! bet_type={bet_type}, boost_chance={boost_chance}")
                
                # Handle multiple bets with cheat
                if bet_type == "multiple" and bet_value:
                    # Try to make at least one bet win
                    potential_winning_numbers = []
                    for bet_key, bet in bet_value.items():
                        if isinstance(bet, dict):
                            bet_type_inner = bet.get('type') or bet.get('Type') or ''
                            bet_value_inner = bet.get('value') or bet.get('Value')
                        else:
                            bet_type_inner = getattr(bet, 'type', getattr(bet, 'Type', ''))
                            bet_value_inner = getattr(bet, 'value', getattr(bet, 'Value', None))
                        
                        # For straight bets, add the specific number
                        if bet_type_inner == "straight" and bet_value_inner is not None:
                            try:
                                straight_number = int(bet_value_inner)
                                if 0 <= straight_number <= 36:
                                    potential_winning_numbers.append(straight_number)
                                    print(f"[Roulette] ?? Cheat: Found straight bet on {straight_number}")
                            except (ValueError, TypeError):
                                pass
                        
                        # For color bets, add numbers of that color
                        elif bet_type_inner == "red":
                            potential_winning_numbers.extend(RED_NUMBERS)
                            print(f"[Roulette] ?? Cheat: Found red bet, adding red numbers")
                        elif bet_type_inner == "black":
                            black_numbers = [n for n in range(1, 37) if n not in RED_NUMBERS]
                            potential_winning_numbers.extend(black_numbers)
                            print(f"[Roulette] ?? Cheat: Found black bet, adding black numbers")
                        elif bet_type_inner == "even":
                            even_numbers = [n for n in range(2, 37, 2)]  # 2, 4, 6, ..., 36
                            potential_winning_numbers.extend(even_numbers)
                            print(f"[Roulette] ?? Cheat: Found even bet, adding even numbers")
                        elif bet_type_inner == "odd":
                            odd_numbers = [n for n in range(1, 37, 2)]  # 1, 3, 5, ..., 35
                            potential_winning_numbers.extend(odd_numbers)
                            print(f"[Roulette] ?? Cheat: Found odd bet, adding odd numbers")
                        elif bet_type_inner == "low":
                            low_numbers = list(range(1, 19))  # 1-18
                            potential_winning_numbers.extend(low_numbers)
                            print(f"[Roulette] ?? Cheat: Found low bet, adding low numbers")
                        elif bet_type_inner == "high":
                            high_numbers = list(range(19, 37))  # 19-36
                            potential_winning_numbers.extend(high_numbers)
                            print(f"[Roulette] ?? Cheat: Found high bet, adding high numbers")
                    
                    # If we have potential winning numbers, pick one
                    if potential_winning_numbers:
                        winning_number = random.choice(potential_winning_numbers)
                        color = get_color(winning_number)
                        print(f"[Roulette] ?? Cheat: Selected winning_number={winning_number}, color={color} from {len(potential_winning_numbers)} options")
                    else:
                        print(f"[Roulette] ?? Cheat: No potential winning numbers found, using random")
                
                # Handle simple bet types
                elif bet_type == "red" and color != "red":
                    winning_number = random.choice(RED_NUMBERS)
                    color = "red"
                    print(f"[Roulette] ?? Cheat: Set winning_number={winning_number} (red)")
                elif bet_type == "black" and color != "black":
                    winning_number = random.choice([n for n in range(1, 37) if n not in RED_NUMBERS])
                    color = "black"
                    print(f"[Roulette] ?? Cheat: Set winning_number={winning_number} (black)")
                elif bet_type == "straight" and bet_value:
                    # Try to extract the number from bet_value
                    for bet_key, bet in bet_value.items():
                        if isinstance(bet, dict):
                            bet_number_value = bet.get('value') or bet.get('Value')
                        else:
                            bet_number_value = getattr(bet, 'value', getattr(bet, 'Value', None))
                        
                        if bet_number_value is not None:
                            try:
                                straight_number = int(bet_number_value)
                                if 0 <= straight_number <= 36:
                                    winning_number = straight_number
                                    color = get_color(winning_number)
                                    print(f"[Roulette] ?? Cheat: Set winning_number={winning_number} (straight bet)")
                                    break
                            except (ValueError, TypeError):
                                pass
                
                # Log cheat activation
                if logger:
                    logger.log_info("Cheat activated", {
                        "game": "roulette",
                        "username": username,
                        "cheat_type": cheat_type,
                        "cheat_boosted": cheat_boosted,
                        "winning_number": winning_number,
                        "color": color
                    })

        # Calculate win and payout
        win = False
        payout = 0.0

        # Handle multiple bets (bet_type == "multiple" with bet_value dict)
        if bet_type == "multiple" and bet_value:
            # ALL multiple bets are evaluated independently:
            # each leg is evaluated separately; any winning leg makes the spin a win
            # Payout is the sum of all winning legs
            total_payout = 0.0
            win = False  # Initialize win to False for multiple bets
            print(
                f"[Roulette] Processing multiple bets. bet_value: {bet_value}, "
                f"winning_number: {winning_number}, color: {color}"
            )
            for bet_key, bet in bet_value.items():
                # Handle both dict and object formats
                if isinstance(bet, dict):
                    bet_type_inner = bet.get("type") or bet.get("Type") or ""
                    bet_amount_inner = float(
                        bet.get("amount") or bet.get("Amount") or bet.get("betAmount") or 0
                    )
                else:
                    bet_type_inner = getattr(bet, "type", getattr(bet, "Type", ""))
                    bet_amount_inner = float(
                        getattr(
                            bet,
                            "amount",
                            getattr(bet, "Amount", getattr(bet, "betAmount", 0)),
                        )
                    )

                print(
                    f"[Roulette] Processing bet: key={bet_key}, type={bet_type_inner}, "
                    f"amount={bet_amount_inner}, winning_number={winning_number}, color={color}"
                )
                bet_win = False
                if bet_type_inner == "red":
                    bet_win = color == "red"
                    print(f"[Roulette] Red bet check: color={color}, bet_win={bet_win}")
                elif bet_type_inner == "black":
                    bet_win = color == "black"
                    print(f"[Roulette] Black bet check: color={color}, bet_win={bet_win}")
                elif bet_type_inner == "even":
                    # Even numbers: 2, 4, 6, ..., 36 (0 is NOT even for betting purposes)
                    bet_win = winning_number > 0 and winning_number % 2 == 0
                elif bet_type_inner == "odd":
                    # Odd numbers: 1, 3, 5, ..., 35 (0 is NOT odd)
                    bet_win = winning_number > 0 and winning_number % 2 == 1
                elif bet_type_inner == "low":
                    # Low numbers: 1-18 (0 is NOT low)
                    bet_win = 1 <= winning_number <= 18
                elif bet_type_inner == "high":
                    # High numbers: 19-36 (0 and 1-18 are NOT high)
                    bet_win = 19 <= winning_number <= 36
                elif bet_type_inner == "straight":
                    # Straight bet on specific number
                    bet_number_value = None
                    if isinstance(bet, dict):
                        bet_number_value = bet.get("value") or bet.get("Value")
                    elif hasattr(bet, "value"):
                        bet_number_value = bet.value
                    elif hasattr(bet, "Value"):
                        bet_number_value = bet.Value

                    if bet_number_value is not None:
                        try:
                            bet_number = int(bet_number_value)
                            bet_win = winning_number == bet_number
                            print(
                                f"[Roulette] Straight bet check: bet_number={bet_number}, "
                                f"winning_number={winning_number}, bet_win={bet_win}"
                            )
                        except (ValueError, TypeError) as e:
                            print(
                                f"[Roulette] Error parsing bet_number_value "
                                f"'{bet_number_value}': {e}"
                            )
                            bet_win = False
                    else:
                        print(
                            "[Roulette] No bet_number_value found for straight bet"
                        )
                        bet_win = False

                if bet_win:
                    # Calculate payout based on bet type
                    if bet_type_inner == "straight":
                        payout_amount = bet_amount_inner * 36  # 36x for straight
                        total_payout += payout_amount
                        print(f"[Roulette] ✅ Straight bet WON! Payout: {payout_amount}")
                    else:
                        payout_amount = bet_amount_inner * 2  # 2x for other bets
                        total_payout += payout_amount
                        print(
                            f"[Roulette] ✅ {bet_type_inner} bet WON! "
                            f"Payout: {payout_amount}"
                        )
                    win = True  # Set win to True if ANY bet wins
                    print(
                        "[Roulette] Win flag set to True (at least one bet won)"
                    )
                else:
                    print(f"[Roulette] ❌ {bet_type_inner} bet LOST")

            payout = total_payout
            print("[Roulette] ========== FINAL RESULT ==========")
            print(
                f"[Roulette] win={win}, total_payout={total_payout}, "
                f"winning_number={winning_number}, color={color}"
            )
            print("[Roulette] ===================================")
        elif bet_type == "red":
            win = color == "red"
            payout = bet_amount * 2 if win else 0
        elif bet_type == "black":
            win = color == "black"
            payout = bet_amount * 2 if win else 0
        elif bet_type == "even":
            # Even numbers: 2, 4, 6, ..., 36 (0 is NOT even for betting purposes)
            win = winning_number > 0 and winning_number % 2 == 0
            payout = bet_amount * 2 if win else 0
        elif bet_type == "odd":
            # Odd numbers: 1, 3, 5, ..., 35 (0 is NOT odd)
            win = winning_number > 0 and winning_number % 2 == 1
            payout = bet_amount * 2 if win else 0
        elif bet_type == "low":
            # Low numbers: 1-18 (0 is NOT low)
            win = 1 <= winning_number <= 18
            payout = bet_amount * 2 if win else 0
        elif bet_type == "high":
            # High numbers: 19-36 (0 and 1-18 are NOT high)
            # Bug fix: Ensure 0 and numbers 1-18 are correctly identified as losses
            win = winning_number >= 19 and winning_number <= 36
            payout = bet_amount * 2 if win else 0
        elif bet_type == "straight":
            # Straight bet on a specific number
            # If bet_value is provided, check if winning number matches
            if bet_value:
                # Extract the number from bet_value (could be in various formats)
                for bet_key, bet in bet_value.items():
                    try:
                        bet_number = int(bet.value) if hasattr(bet, 'value') else int(bet_key.replace('bet_', ''))
                        if winning_number == bet_number:
                            win = True
                            payout = bet_amount * 36  # 36x payout for straight bet
                            break
                    except (ValueError, AttributeError):
                        continue
            # If no bet_value or no match, it's a loss
            if not win:
                win = False
                payout = 0
        else:
            # Unknown bet type - default to loss
            win = False
            payout = 0

        # Apply house advantage feature flag if enabled
        # This reduces win probability by 25% when the casino is losing too much money
        if win and payout > 0 and house_advantage_enabled:
            # 25% chance to convert a win into a loss (house advantage)
            if random.random() < 0.25:
                win = False
                payout = 0.0
                print(f"[Roulette] 🏠 House advantage applied: win converted to loss")
                if span:
                    span.set_attribute("feature_flag.house_advantage_applied", True)

        # Store game state in Redis
        game_state = {
            "last_spin": datetime.utcnow().isoformat() + "Z",
            "winning_number": winning_number,
            "color": color,
            "win": win,
            "payout": payout,
            "bet_amount": bet_amount,
            "bet_type": bet_type,
            "cheat_active": cheat_active,
            "cheat_type": cheat_type,
            "cheat_boosted": cheat_boosted
        }
        save_game_state(username, game_state)

        # Calculate total bet amount (sum of all individual bets if multiple bets)
        total_bet_amount = bet_amount
        if bet_type == "multiple" and bet_value:
            # Sum all individual bet amounts
            total_bet_amount = 0.0
            for bet_key, bet in bet_value.items():
                if isinstance(bet, dict):
                    bet_amount_inner = float(bet.get('amount') or bet.get('Amount') or bet.get('betAmount') or 0)
                else:
                    bet_amount_inner = float(getattr(bet, 'amount', getattr(bet, 'Amount', getattr(bet, 'betAmount', 0))))
                total_bet_amount += bet_amount_inner
        
        # Record game result in scoring service for ALL games (wins and losses) to track total bets
        record_game_result_async({
            "username": username,
            "game": "roulette",
            "action": "spin",
            "betAmount": total_bet_amount,
            "payout": payout,
            "win": win and payout > 0,
            "result": "win" if (win and payout > 0) else "lose",
                "gameData": {
                    "winning_number": winning_number,
                    "color": color,
                    "bet_type": bet_type,
                },
                "metadata": {
                    "cheat_active": cheat_active,
                    "cheat_type": cheat_type,
                    "cheat_boosted": cheat_boosted,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                },
            })

        # Log game result
        if logger:
            logger.log_game_end("roulette", username, f"Number {winning_number} ({color})", payout, win, {
                "winning_number": winning_number,
                "color": color,
                "bet_type": bet_type,
                "cheat_boosted": cheat_boosted
            })

        if span:
            add_game_attributes(span, {
                "winning_number": winning_number,
                "color": color,
                "win": win,
                "payout": payout,
                "cheat_boosted": cheat_boosted,
            })
            span.set_attribute("http.status_code", 200)
            span.end()

        return roulette_pb2.SpinResponse(
            winning_number=winning_number,
            color=color,
            win=win,
            payout=payout,
            timestamp=datetime.utcnow().isoformat() + "Z",
            cheat_active=cheat_active,
            cheat_type=cheat_type,
            cheat_boosted=cheat_boosted
        )

    def GetGameAssets(self, request, context):
        html = generate_roulette_html()
        js = generate_roulette_js()
        css = generate_roulette_css()
        
        config = {
            "service_endpoint": os.getenv("SERVICE_ENDPOINT", "localhost:50052"),
            "game_name": "Roulette",
            "game_type": "european-roulette",
            "min_bet": "10",
            "max_bet": "1000"
        }

        return roulette_pb2.GameAssetsResponse(
            html=html,
            javascript=js,
            css=css,
            config=config
        )


def generate_roulette_html():
    return """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Roulette Game</title>
    <link rel="stylesheet" href="https://cdn.tailwindcss.com">
</head>
<body class="bg-green-900 text-white p-4">
    <div id="roulette-game-container" class="max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-4 text-center">?? Roulette</h1>
        <div id="roulette-result" class="text-center mb-4">
            <div id="winning-number" class="text-6xl font-bold mb-2">?</div>
            <div id="color" class="text-2xl"></div>
        </div>
        <div class="mb-4">
            <label class="block mb-2">Bet Type:</label>
            <select id="bet-type" class="w-full p-2 bg-gray-800 text-white rounded">
                <option value="red">Red</option>
                <option value="black">Black</option>
                <option value="even">Even</option>
                <option value="odd">Odd</option>
                <option value="low">Low (1-18)</option>
                <option value="high">High (19-36)</option>
            </select>
        </div>
        <div class="mb-4">
            <label class="block mb-2">Bet Amount:</label>
            <input type="number" id="bet-amount" value="10" min="10" max="1000" class="w-full p-2 bg-gray-800 text-white rounded">
        </div>
        <button id="spin-btn" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg">
            Spin
        </button>
        <div id="result" class="mt-4 text-center"></div>
    </div>
    <script src="/roulette-game.js"></script>
</body>
</html>"""


def generate_roulette_js():
    return """
// Roulette Game JavaScript
async function initRouletteGame() {
    console.log('Initializing roulette game...');
    
    document.getElementById('spin-btn').addEventListener('click', async () => {
        const betAmount = parseFloat(document.getElementById('bet-amount').value);
        const betType = document.getElementById('bet-type').value;
        
        try {
            const response = await callRouletteService('Spin', {
                bet_type: betType,
                bet_amount: betAmount,
                cheat_active: false
            });
            
            document.getElementById('winning-number').textContent = response.winning_number;
            document.getElementById('color').textContent = response.color.toUpperCase();
            
            if (response.win) {
                document.getElementById('result').innerHTML = 
                    `<div class="text-green-500 text-xl">?? Win! Payout: $${response.payout.toFixed(2)}</div>`;
            } else {
                document.getElementById('result').innerHTML = 
                    `<div class="text-red-500 text-xl">?? No win this time</div>`;
            }
        } catch (error) {
            console.error('Error spinning roulette:', error);
            document.getElementById('result').innerHTML = 
                '<div class="text-red-500">Error: ' + error.message + '</div>';
        }
    });
}

async function callRouletteService(method, data) {
    const response = await fetch(`/api/roulette/${method.toLowerCase()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    return await response.json();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouletteGame);
} else {
    initRouletteGame();
}
"""


def generate_roulette_css():
    return """
#roulette-game-container {
    font-family: 'Inter', sans-serif;
}

#winning-number {
    border: 4px solid #DC2626;
    border-radius: 50%;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto;
    box-shadow: 0 0 30px rgba(220, 38, 38, 0.5);
}

#spin-btn {
    transition: all 0.3s;
}

#spin-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);
}

#spin-btn:active {
    transform: translateY(0);
}
"""


class RouletteHTTPHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler for health checks and HTTP endpoints"""
    
    def do_GET(self):
        """Handle GET requests"""
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            service_name = os.getenv("SERVICE_NAME", "vegas-roulette-service")
            response = {
                "status": "ok",
                "service": service_name,
                "serviceMetadata": {
                    "version": METADATA["version"],
                    "gameType": METADATA["gameType"],
                    "complexity": METADATA["complexity"],
                    "rtp": METADATA["rtp"],
                    "maxPayout": METADATA["maxPayout"],
                    "owner": METADATA["owner"],
                    "technology": METADATA["technology"],
                    "timestamp": datetime.utcnow().isoformat() + "Z"
                }
            }
            self.wfile.write(json.dumps(response).encode("utf-8"))
        else:
            self.send_response(404)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode("utf-8"))
    
    def log_message(self, format, *args):
        """Suppress default logging"""
        pass


def serve_http():
    """Start HTTP server for health checks"""
    http_port = int(os.getenv("PORT", "8082"))
    server = HTTPServer(('0.0.0.0', http_port), RouletteHTTPHandler)
    if logger:
        logger.log_info("Roulette HTTP server started", {"port": http_port})
    print(f"?? Roulette HTTP server listening on port {http_port}")
    server.serve_forever()


def serve_grpc():
    """Start gRPC server"""
    if roulette_pb2_grpc is None:
        error_msg = "Error: gRPC proto files not available. Cannot start gRPC server."
        if logger:
            logger.log_error(Exception(error_msg))
        print(error_msg)
        return

    grpc_port = os.getenv("GRPC_PORT", "50052")
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    roulette_pb2_grpc.add_RouletteServiceServicer_to_server(
        RouletteServiceServicer(), server
    )
    server.add_insecure_port(f'[::]:{grpc_port}')
    server.start()
    if logger:
        logger.log_info("Roulette gRPC server started", {"port": grpc_port})
    print(f"?? Roulette gRPC server listening on port {grpc_port}")
    server.wait_for_termination()


if __name__ == '__main__':
    # Initialize Redis
    initialize_redis()
    import threading
    
    service_name = os.getenv("SERVICE_NAME", "vegas-roulette-service")
    if logger:
        logger.log_info("Roulette service initializing", {
            "service": service_name,
            "version": METADATA.get("version", "2.1.0"),
            "game_type": METADATA.get("gameType", "european-roulette")
        })
    
    # Start HTTP server in a separate thread for health checks
    http_thread = threading.Thread(target=serve_http, daemon=True)
    http_thread.start()
    
    # Start gRPC server in a separate thread
    grpc_thread = threading.Thread(target=serve_grpc, daemon=True)
    grpc_thread.start()
    
    # Keep main thread alive
    if logger:
        logger.log_info("Roulette service running (HTTP + gRPC)")
    print("?? Roulette service running (HTTP + gRPC)")
    print("Press Ctrl+C to stop")
    
    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        if logger:
            logger.log_info("Roulette service shutting down")
        print("\nShutting down...")

