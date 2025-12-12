#!/usr/bin/env python3
"""
Vegas Roulette Service - Python Implementation
"""

import os
import json
import random
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import sys

# Initialize OpenTelemetry
try:
    from opentelemetry import trace
    from opentelemetry_setup import initialize_telemetry, add_game_attributes, add_http_attributes
    
    tracer = initialize_telemetry("vegas-roulette-service", {
        "version": METADATA["version"],
        "gameType": METADATA["gameType"],
        "gameCategory": "table-games",
        "complexity": METADATA["complexity"],
        "rtp": METADATA["rtp"],
        "maxPayout": METADATA["maxPayout"],
        "owner": METADATA["owner"],
    })
except ImportError:
    # Fallback if OpenTelemetry not installed
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

# Initialize OpenTelemetry
try:
    from opentelemetry import trace
    from opentelemetry_setup import initialize_telemetry, add_game_attributes, add_http_attributes
    
    tracer = initialize_telemetry("vegas-roulette-service", {
        "version": METADATA["version"],
        "gameType": METADATA["gameType"],
        "gameCategory": "table-games",
        "complexity": METADATA["complexity"],
        "rtp": METADATA["rtp"],
        "maxPayout": METADATA["maxPayout"],
        "owner": METADATA["owner"],
    })
except (ImportError, NameError):
    # Fallback if OpenTelemetry not installed or METADATA not ready
    print("Warning: OpenTelemetry not available, running without instrumentation")
    tracer = None


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


class RouletteHandler(BaseHTTPRequestHandler):
    """HTTP Request Handler for Roulette Service"""

    def _start_span(self, name):
        """Start OpenTelemetry span"""
        return tracer.start_as_current_span(name)

    def _send_json_response(self, data, status=200):
        """Send JSON response"""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode("utf-8"))

    def do_GET(self):
        """Handle GET requests"""
        if tracer:
            with tracer.start_as_current_span("http_request") as span:
                add_http_attributes(span, "GET", self.path)
                
                if self.path == "/health":
                    self._handle_health(span)
                else:
                    span.set_attribute("http.status_code", 404)
                    self._send_json_response({"error": "Not found"}, 404)
        else:
            if self.path == "/health":
                self._handle_health(None)
            else:
                self._send_json_response({"error": "Not found"}, 404)

    def do_POST(self):
        """Handle POST requests"""
        if tracer:
            with tracer.start_as_current_span("http_request") as span:
                add_http_attributes(span, "POST", self.path)
                
                if self.path == "/spin":
                    self._handle_spin(span)
                else:
                    span.set_attribute("http.status_code", 404)
                    self._send_json_response({"error": "Not found"}, 404)
        else:
            if self.path == "/spin":
                self._handle_spin(None)
            else:
                self._send_json_response({"error": "Not found"}, 404)

    def _handle_health(self, span=None):
        """Handle health check"""
        if span:
            add_http_attributes(span, "GET", "/health", 200)
            add_game_attributes(span, {
                "category": "table-games",
                "type": METADATA["gameType"],
                "complexity": METADATA["complexity"],
                "rtp": METADATA["rtp"],
                "max_payout": METADATA["maxPayout"],
            })
        
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
        self._send_json_response(response)

    def _handle_spin(self, span=None):
        """Handle roulette spin"""
        if span:
            add_http_attributes(span, "POST", "/spin")
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))
        except Exception as e:
            self._send_json_response({"error": f"Invalid request: {str(e)}"}, 400)
            return

        # Extract request data
        cheat_active = data.get("CheatActive", False)
        cheat_type = data.get("CheatType")
        bet_type = data.get("BetType")
        bet_value = data.get("BetValue")

        # Generate winning number
        winning_number = random.randint(0, 36)
        cheat_boosted = False

        # Apply cheat logic
        if cheat_active and bet_type == "multiple" and isinstance(bet_value, dict):
            boost_chance = get_cheat_boost_chance(cheat_type)
            if random.random() < boost_chance:
                cheat_boosted = True
                potential_winning_numbers = []

                for test_number in range(37):
                    test_color = get_color(test_number)

                    for bet_key, bet in bet_value.items():
                        if not isinstance(bet, dict):
                            continue

                        bet_type_inner = bet.get("type")
                        bet_val = bet.get("value")

                        would_win = False
                        if bet_type_inner == "straight" and test_number == int(bet_val):
                            would_win = True
                        elif bet_type_inner == "red" and test_color == "red":
                            would_win = True
                        elif bet_type_inner == "black" and test_color == "black":
                            would_win = True
                        elif bet_type_inner == "even" and test_number > 0 and test_number % 2 == 0:
                            would_win = True
                        elif bet_type_inner == "odd" and test_number > 0 and test_number % 2 == 1:
                            would_win = True
                        elif bet_type_inner == "low" and 1 <= test_number <= 18:
                            would_win = True
                        elif bet_type_inner == "high" and 19 <= test_number <= 36:
                            would_win = True

                        if would_win:
                            potential_winning_numbers.append(test_number)
                            break

                if potential_winning_numbers:
                    winning_number = random.choice(potential_winning_numbers)

        # Calculate payout
        color = get_color(winning_number)
        payout = 0
        any_win = False

        if bet_type == "multiple" and isinstance(bet_value, dict):
            for bet_key, bet in bet_value.items():
                if not isinstance(bet, dict):
                    continue

                amount = float(bet.get("amount", 0))
                bet_type_inner = bet.get("type")
                bet_val = bet.get("value")

                win = False
                multi = 0

                if bet_type_inner == "straight":
                    win = winning_number == int(bet_val)
                    multi = 35
                elif bet_type_inner == "red":
                    win = color == "red"
                    multi = 1
                elif bet_type_inner == "black":
                    win = color == "black"
                    multi = 1
                elif bet_type_inner == "even":
                    win = winning_number > 0 and winning_number % 2 == 0
                    multi = 1
                elif bet_type_inner == "odd":
                    win = winning_number > 0 and winning_number % 2 == 1
                    multi = 1
                elif bet_type_inner == "low":
                    win = 1 <= winning_number <= 18
                    multi = 1
                elif bet_type_inner == "high":
                    win = 19 <= winning_number <= 36
                    multi = 1

                if win and amount > 0:
                    payout += amount * (multi + 1)
                    any_win = True
        else:
            # Fallback simple color bet
            bet_amount = float(data.get("BetAmount", 10))
            bet_type_simple = data.get("BetType", "red")
            is_win = color == bet_type_simple
            payout = bet_amount * 2 if is_win else 0
            any_win = is_win

        # Add game attributes to span
        if span:
            add_game_attributes(span, {
                "action": "spin",
                "winning_number": winning_number,
                "color": color,
                "win": any_win,
                "payout": payout,
                "cheat_active": cheat_active,
                "cheat_type": cheat_type or "",
                "cheat_boosted": cheat_boosted,
            })
            span.set_attribute("http.status_code", 200)

        response = {
            "winningNumber": winning_number,
            "color": color,
            "win": any_win,
            "payout": payout,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "cheatActive": cheat_active,
            "cheatType": cheat_type,
            "cheatBoosted": cheat_boosted
        }

        print(f"🎲 Roulette Spin: {winning_number} ({color}), Win: {any_win}, Payout: {payout}")
        self._send_json_response(response)

    def log_message(self, format, *args):
        """Override to use print instead of stderr"""
        print(f"[{self.address_string()}] {format % args}")


def main():
    """Main function"""
    port = int(os.getenv("PORT", "8082"))
    service_name = os.getenv("SERVICE_NAME", "vegas-roulette-service")

    server = HTTPServer(("0.0.0.0", port), RouletteHandler)
    print(f"[{service_name}] Listening on port {port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        server.shutdown()


if __name__ == "__main__":
    main()

