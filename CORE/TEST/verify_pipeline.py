import sys
import os
import json
import logging


# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("VERIFY")

def debug_print(msg):
    print(msg, flush=True)

debug_print("VERIFY: Script starting...")

# Add root to path
sys.path.append(os.getcwd())

try:
    debug_print("VERIFY: Importing redis_client...")
    from CORE.BACKEND.redis_tools import get_redis_client
    debug_print("VERIFY: Importing LocationPolygonsGenerator...")
    # Import unified generator
    from CORE.BACKEND import LocationPolygonsGenerator
    from CORE.BACKEND.redis_tools import KEY_RED_LINES, KEY_BLUE_CIRCLES, KEY_WHITE_LINES, KEY_POLYGONS, KEY_GROUPS
    debug_print("VERIFY: Imports complete.")
except ImportError as e:
    debug_print(f"VERIFY: Import failed: {e}")
    logger.error(f"Import failed: {e}")
    sys.exit(1)

def verify_pipeline():
    debug_print("VERIFY: Getting Redis client...")
    r = get_redis_client()
    
    # 1. Clear keys to ensure we are testing fresh write
    debug_print("VERIFY: Clearing old Redis keys...")
    logger.info("Clearing old Redis keys...")
    keys_to_delete = [
        KEY_RED_LINES, KEY_BLUE_CIRCLES, KEY_WHITE_LINES, KEY_POLYGONS, KEY_GROUPS, "game:meta", "game:adjacency", "game:green_circles"
    ]
    r.delete(*keys_to_delete)
    
    # 2. Run Generation (using a known location, e.g. London or existing lat/lon)
    lat = 55.7558 
    lon = 37.6173
    
    debug_print(f"VERIFY: Running generation for {lat}, {lon}...")
    logger.info(f"Running generation for {lat}, {lon}...")
    try:
        # Instantiate and run
        generator = LocationPolygonsGenerator.LocationPolygonsGenerator()
        data = generator.generate_map(lat, lon, force_rebuild=True)
        
        debug_print(f"VERIFY: Generation returned data type: {type(data)}")
        if not data:
            logger.error("Generation returned empty data!")
            return False
    except Exception as e:
        debug_print(f"VERIFY: Generation failed with exception: {e}")
        logger.error(f"Generation failed: {e}")
        import traceback
        traceback.print_exc()
        return False
        
    # 3. Check Redis Keys
    debug_print("VERIFY: Verifying Redis Keys...")
    logger.info("Verifying Redis Keys...")
    
    checks = {
        KEY_RED_LINES: "Red Lines",
        KEY_BLUE_CIRCLES: "Blue Circles",
        KEY_WHITE_LINES: "White Lines",
        KEY_POLYGONS: "Polygons",
        KEY_GROUPS: "Groups"
    }
    
    all_passed = True
    for key, name in checks.items():
        val = r.get(key)
        if val:
            parsed = json.loads(val)
            count = len(parsed)
            debug_print(f"VERIFY: ✅ {name}: Found {count} items.")
            logger.info(f"✅ {name}: Found {count} items.")
            if count == 0 and name != "Groups": # Groups might be 0 if no polygons
                debug_print(f"VERIFY: ⚠️ {name} is empty!")
                logger.warning(f"⚠️ {name} is empty!")
        else:
            debug_print(f"VERIFY: ❌ {name}: Key missing!")
            logger.error(f"❌ {name}: Key missing!")
            all_passed = False
            
    if all_passed:
        debug_print("VERIFY: 🎉 SUCCESS: All Redis keys populated.")
        logger.info("🎉 SUCCESS: All Redis keys populated.")
    else:
        debug_print("VERIFY: 🚫 FAILURE: Some Redis keys are missing.")
        logger.error("🚫 FAILURE: Some Redis keys are missing.")
        
    return all_passed

if __name__ == "__main__":
    verify_pipeline()

