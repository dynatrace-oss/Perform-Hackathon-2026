#!/usr/bin/env python3
"""
Redis helper for Roulette Service
"""

import os
import json
import redis
from datetime import datetime
from typing import Optional, Dict, Any

# Redis client instance
redis_client = None

# Redis key prefix and TTL
GAME_STATE_KEY_PREFIX = "roulette:game:"
GAME_STATE_TTL = 3600  # 1 hour


def initialize_redis():
    """Initialize Redis client"""
    global redis_client
    
    redis_host = os.getenv("REDIS_HOST", "localhost")
    redis_port = int(os.getenv("REDIS_PORT", "6379"))
    redis_password = os.getenv("REDIS_PASSWORD", None)
    
    try:
        redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            password=redis_password,
            decode_responses=True,
            socket_connect_timeout=5
        )
        
        # Test connection
        redis_client.ping()
        print(f"✅ Connected to Redis at {redis_host}:{redis_port}")
    except Exception as e:
        print(f"Warning: Failed to connect to Redis: {e}. Game state will not be persisted.")
        redis_client = None


def get_game_state(username: str) -> Optional[Dict[str, Any]]:
    """Retrieve game state from Redis"""
    if redis_client is None:
        return None
    
    try:
        key = f"{GAME_STATE_KEY_PREFIX}{username}"
        state_json = redis_client.get(key)
        if state_json:
            return json.loads(state_json)
        return None
    except Exception as e:
        print(f"Error getting game state from Redis: {e}")
        return None


def save_game_state(username: str, game_state: Dict[str, Any]) -> bool:
    """Save game state to Redis"""
    if redis_client is None:
        return False  # Silently fail if Redis is not available
    
    try:
        key = f"{GAME_STATE_KEY_PREFIX}{username}"
        state_json = json.dumps(game_state)
        redis_client.setex(key, GAME_STATE_TTL, state_json)
        return True
    except Exception as e:
        print(f"Error saving game state to Redis: {e}")
        return False


def delete_game_state(username: str) -> bool:
    """Delete game state from Redis"""
    if redis_client is None:
        return False
    
    try:
        key = f"{GAME_STATE_KEY_PREFIX}{username}"
        redis_client.delete(key)
        return True
    except Exception as e:
        print(f"Error deleting game state from Redis: {e}")
        return False
