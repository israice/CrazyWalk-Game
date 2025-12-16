import logging
import json
import sys
import os

# Setup path
sys.path.append(os.getcwd())

# Configure logging
logging.basicConfig(level=logging.INFO)

try:
    from CORE.BACKEND import A_create_polygons
    
    # Test Coordinates (Tel Aviv - Dizengoff area usually has roads)
    lat = 32.08055
    lon = 34.78018
    
    print(f"Testing generation for {lat}, {lon}...")
    data = A_create_polygons.run_list(lat, lon, region_size=0.002) # Small region for speed
    
    print("Keys found:", data.keys())
    print(f"Red Lines: {len(data.get('red_lines', []))}")
    print(f"Blue Circles: {len(data.get('blue_circles', []))}")
    print(f"White Lines: {len(data.get('white_lines', []))}")
    print(f"Polygons: {len(data.get('polygons', []))}")
    
    # Dump small sample
    # print(json.dumps(data, indent=2))
    
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
