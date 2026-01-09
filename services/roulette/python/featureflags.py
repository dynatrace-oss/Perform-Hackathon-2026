"""
Feature Flag Helper for Python Services
Provides simple interface to check feature flags via flagd or environment variables
"""

import os
import json
import urllib.request
import urllib.error

# flagd connection details
FLAGD_HOST = os.getenv("FLAGD_HOST", "localhost")
FLAGD_PORT = os.getenv("FLAGD_PORT", "8014")
FLAGD_HTTP_PORT = os.getenv("FLAGD_HTTP_PORT", "8013")


def get_feature_flag(flag_key, default_value=False):
    """
    Get a boolean feature flag value from flagd or environment variable
    
    Args:
        flag_key: The feature flag key (e.g., "casino.house-advantage")
        default_value: Default value if flag cannot be retrieved
    
    Returns:
        Boolean value of the feature flag
    """
    # First, try environment variable (for testing/fallback)
    env_key = f"FLAG_{flag_key.replace('.', '_').upper()}"
    env_value = os.getenv(env_key)
    if env_value is not None:
        return env_value.lower() in ("true", "1", "yes")
    
    # Try to get from flagd via HTTP (flagd exposes REST API on port 8013)
    try:
        url = f"http://{FLAGD_HOST}:{FLAGD_HTTP_PORT}/schema/v1/flags/{flag_key}"
        req = urllib.request.Request(url)
        req.add_header("Content-Type", "application/json")
        
        with urllib.request.urlopen(req, timeout=1) as response:
            data = json.loads(response.read().decode())
            # flagd returns flag data in a specific format
            if "state" in data and data["state"] == "ENABLED":
                variant = data.get("defaultVariant", str(default_value))
                # Check if variant is "true" or boolean true
                if variant == "true" or variant is True:
                    return True
                elif variant == "false" or variant is False:
                    return False
                # If variant is a string representation of boolean, parse it
                try:
                    return json.loads(variant.lower())
                except (ValueError, TypeError):
                    pass
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError) as e:
        # If flagd is not available, fall back to default
        pass
    
    return default_value
