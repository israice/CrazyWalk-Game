import json
import logging
import os
import sys

import redis

def get_redis_client():
    """
    Returns a configured Redis client instance.
    Uses environment variables REDIS_HOST and REDIS_PORT.
    Defaults to 'redis' and 6379.
    """
    return redis.Redis(
        host=os.getenv('REDIS_HOST', 'localhost'),
        port=int(os.getenv('REDIS_PORT', 6379)),
        db=0,
        decode_responses=True
    )

logger = logging.getLogger(__name__)

# Key Constants
KEY_RED_LINES = "game:red_lines"
KEY_BLUE_CIRCLES = "game:blue_circles"
KEY_ADJACENCY = "game:adjacency"
KEY_WHITE_LINES = "game:white_lines"
KEY_GREEN_CIRCLES = "game:green_circles"
KEY_POLYGONS = "game:polygons"
KEY_GROUPS = "game:groups"
KEY_META = "game:meta"

def save_to_redis(key, data, expiration=3600):
    """
    Saves data to Redis as a JSON string.
    expiration: seconds to expire (default 1 hour)
    """
    try:
        r = get_redis_client()
        r.set(key, json.dumps(data))
        if expiration:
            r.expire(key, expiration)
        logger.info(f"REDIS: Saved {len(data) if isinstance(data, list) else 'data'} items to {key}")
        return True
    except Exception as e:
        logger.error(f"REDIS: Failed to save to {key}: {e}")
        return False

def load_from_redis(key):
    """
    Loads data from Redis JSON string.
    Returns None if missing or error.
    """
    try:
        r = get_redis_client()
        val = r.get(key)
        if val:
            return json.loads(val)
    except Exception as e:
        logger.error(f"REDIS: Failed to load from {key}: {e}")
    return None
