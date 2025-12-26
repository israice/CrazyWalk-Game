import requests
import json
import time

BASE_URL = "http://localhost:8000"
LAT = 32.055
LON = 34.77

def get_game_data(lat, lon):
    try:
        resp = requests.get(f"{BASE_URL}/api/game_data?lat={lat}&lon={lon}")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Request failed: {e}")
        return None

def verify():
    print(f"--- Request 1: {LAT}, {LON} ---")
    data1 = get_game_data(LAT, LON)
    if not data1: return
    
    poster_grid1 = data1.get('poster_grid', [])
    images1 = [p['image_url'] for p in poster_grid1]
    print(f"Images 1: {images1}")

    print(f"\n--- Request 2: {LAT}, {LON} (Should be Identical) ---")
    data2 = get_game_data(LAT, LON)
    if not data2: return
    
    poster_grid2 = data2.get('poster_grid', [])
    images2 = [p['image_url'] for p in poster_grid2]
    print(f"Images 2: {images2}")

    if images1 == images2:
        print("\n✅ SUCCESS: Poster assignments are persistent!")
    else:
        print("\n❌ FAILURE: Poster assignments changed!")

if __name__ == "__main__":
    verify()
