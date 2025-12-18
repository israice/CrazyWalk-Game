import time
import sys
import os

# Ensure CORE is in path if running from root
sys.path.append(os.path.join(os.getcwd(), 'CORE'))

try:
    from redis_client import get_redis_client
except ImportError:
    # Try importing directly if running from CORE
    from CORE.redis_client import get_redis_client

def verify():
    print("Verifying Redis connection...")
    try:
        r = get_redis_client()
        if r.ping():
            print("Success: Connected to Redis!")
        
        r.set('test_key', 'Hello Redis')
        val = r.get('test_key')
        print(f"Set/Get Test: {val}")
        
        if val == 'Hello Redis':
            print("Verification PASSED")
        else:
            print("Verification FAILED: value mismatch")
    except Exception as e:
        print(f"Verification FAILED: {e}")

if __name__ == "__main__":
    verify()
