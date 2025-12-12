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
        if tracer:
            span = tracer.start_span("roulette_spin")
            add_http_attributes(span, "POST", "/spin")
        else:
            span = None

        bet_type = request.bet_type or "red"
        bet_amount = request.bet_amount or 10
        cheat_active = request.cheat_active
        cheat_type = request.cheat_type or ""
        
        # Extract username from player_info
        username = "Anonymous"
        if request.player_info:
            username = request.player_info.get("username", "Anonymous")

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
                # Try to favor player bets
                if bet_type == "red" and color != "red":
                    winning_number = random.choice(RED_NUMBERS)
                    color = "red"
                elif bet_type == "black" and color != "black":
                    winning_number = random.choice([n for n in range(1, 37) if n not in RED_NUMBERS])
                    color = "black"
                
                # Log cheat activation
                if logger:
                    logger.log_info("Cheat activated", {
                        "game": "roulette",
                        "username": username,
                        "cheat_type": cheat_type,
                        "cheat_boosted": cheat_boosted
                    })

        # Calculate win and payout
        win = False
        payout = 0.0

        if bet_type == "red":
            win = color == "red"
            payout = bet_amount * 2 if win else 0
        elif bet_type == "black":
            win = color == "black"
            payout = bet_amount * 2 if win else 0
        elif bet_type == "even":
            win = winning_number > 0 and winning_number % 2 == 0
            payout = bet_amount * 2 if win else 0
        elif bet_type == "odd":
            win = winning_number > 0 and winning_number % 2 == 1
            payout = bet_amount * 2 if win else 0
        elif bet_type == "low":
            win = 1 <= winning_number <= 18
            payout = bet_amount * 2 if win else 0
        elif bet_type == "high":
            win = 19 <= winning_number <= 36
            payout = bet_amount * 2 if win else 0
        elif bet_type == "straight":
            # For straight bets, check if any bet matches
            win = False
            payout = 0

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
        <h1 class="text-3xl font-bold mb-4 text-center">🎲 Roulette</h1>
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
                    `<div class="text-green-500 text-xl">🎉 Win! Payout: $${response.payout.toFixed(2)}</div>`;
            } else {
                document.getElementById('result').innerHTML = 
                    `<div class="text-red-500 text-xl">😢 No win this time</div>`;
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
    print(f"🎲 Roulette HTTP server listening on port {http_port}")
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
    print(f"🎲 Roulette gRPC server listening on port {grpc_port}")
    server.wait_for_termination()


if __name__ == '__main__':
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
    print("🎲 Roulette service running (HTTP + gRPC)")
    print("Press Ctrl+C to stop")
    
    try:
        while True:
            import time
            time.sleep(1)
    except KeyboardInterrupt:
        if logger:
            logger.log_info("Roulette service shutting down")
        print("\nShutting down...")

