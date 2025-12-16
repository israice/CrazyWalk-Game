import logging
import sys
import os

# Setup logging to stdout
logging.basicConfig(level=logging.INFO, stream=sys.stdout)

# Add project root to path so we can import modules
sys.path.append(os.getcwd())

try:
    from CORE.BACKEND import A_create_polygons
    
    # Coordinates from the user's report
    lat = 32.05688
    lon = 34.76878
    
    print(f"Running generation for {lat}, {lon}...")
    result = A_create_polygons.run_list(lat, lon)
    
    print("-" * 20)
    print("Result Keys:", list(result.keys()))
    if not result:
        print("FAILURE: Result is empty.")
    else:
        print("SUCCESS: Data generated.")
        
except Exception as e:
    print(f"CRITICAL ERROR: {e}")
    import traceback
    traceback.print_exc()
