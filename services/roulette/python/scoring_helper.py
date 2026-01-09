#!/usr/bin/env python3
"""
Scoring service helper for Roulette Service
"""

import os
import json
import urllib.request
import urllib.error
from typing import Dict, Any, Optional

SCORING_SERVICE_URL = os.getenv("SCORING_SERVICE_URL", "http://localhost:8085")


def record_game_result(game_result: Dict[str, Any]) -> bool:
    """Record a game result in the scoring service (only called on wins)"""
    try:
        url = f"{SCORING_SERVICE_URL}/api/scoring/game-result"
        payload = {
            "username": game_result.get("username", "Anonymous"),
            "game": game_result.get("game", "roulette"),
            "action": game_result.get("action", "spin"),
            "betAmount": game_result.get("betAmount", 0),
            "payout": game_result.get("payout", 0),
            "win": game_result.get("win", False),
            "result": game_result.get("result", "win" if game_result.get("win") else "lose"),
            "gameData": json.dumps(game_result.get("gameData", {})),
            "metadata": json.dumps(game_result.get("metadata", {})),
        }
        
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                if response.status >= 200 and response.status < 300:
                    print(f"[Scoring] Successfully recorded game result for {game_result.get('username')}")
                    return True
                else:
                    print(f"[Scoring] Scoring service returned status {response.status}")
                    return False
        except urllib.error.HTTPError as e:
            print(f"[Scoring] Failed to record game result: HTTP {e.code}")
            return False
        except urllib.error.URLError as e:
            print(f"[Scoring] Failed to connect to scoring service: {e.reason}")
            return False
    except Exception as e:
        print(f"[Scoring] Error recording game result: {e}")
        return False


def record_game_result_async(game_result: Dict[str, Any]):
    """Record game result asynchronously (non-blocking)"""
    import threading
    
    def _record():
        record_game_result(game_result)
    
    thread = threading.Thread(target=_record, daemon=True)
    thread.start()
