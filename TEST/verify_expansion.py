import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_expansion():
    print("Testing Map Expansion Logic...")
    
    # 1. Initial Generation
    # Uses a real location with roads (Kaliningrad centerish)
    lat1, lon1 = 54.7104, 20.5117 
    print(f"\n1. Requesting INITIAL generation at {lat1}, {lon1}...")
    
    try:
        resp = requests.get(f"{BASE_URL}/api/game_data?lat={lat1}&lon={lon1}&mode=initial")
        resp.raise_for_status()
        data1 = resp.json()
        
        red_lines1 = len(data1.get('red_lines', []) if isinstance(data1.get('red_lines'), list) else []) 
        # Note: red_lines might be empty in response if filtered, but white_lines matters.
        white_lines1 = len(data1.get('white_lines', []))
        polygons1 = len(data1.get('polygons', []))
        
        print(f"   -> Initial Result: {white_lines1} white lines, {polygons1} polygons")
        
        if white_lines1 == 0:
            print("   [WARNING] No white lines generated. Might be a remote area or Overpass issue.")
            # If 0, test might be inconclusive but lets proceed.
            
    except Exception as e:
        print(f"   [ERROR] Initial request failed: {e}")
        return

    # 2. Expansion
    # Move slightly (~50-100m)
    lat2, lon2 = 54.7110, 20.5125
    print(f"\n2. Requesting EXPANSION at {lat2}, {lon2}...")
    
    try:
        resp = requests.get(f"{BASE_URL}/api/game_data?lat={lat2}&lon={lon2}&mode=expand")
        resp.raise_for_status()
        data2 = resp.json()
        
        white_lines2 = len(data2.get('white_lines', []))
        polygons2 = len(data2.get('polygons', []))
        
        print(f"   -> Expansion Result: {white_lines2} white lines, {polygons2} polygons")
        
        # Verification Logic
        # If expansion worked, we should ideally have MORE lines than initial, 
        # or at least the graph should represent the union.
        # Since we moved, we might pick up new roads.
        
        if white_lines2 >= white_lines1:
            print(f"   [SUCCESS] Line count preserved/increased ({white_lines1} -> {white_lines2}).")
        else:
            print(f"   [POSSIBLE FAILURE] Line count decreased ({white_lines1} -> {white_lines2}). Did merge fail?")

    except Exception as e:
        print(f"   [ERROR] Expansion request failed: {e}")

if __name__ == "__main__":
    test_expansion()
