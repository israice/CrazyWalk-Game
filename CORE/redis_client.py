import os
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
