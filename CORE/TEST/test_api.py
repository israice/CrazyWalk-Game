import requests

try:
    url = "http://localhost:8000/api/game_data?lat=32.08055&lon=34.78018"
    print(f"Requesting {url}...")
    resp = requests.get(url, timeout=30)
    
    print(f"Status Code: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        print("Keys found:", data.keys())
        print(f"Red Lines: {len(data.get('red_lines', []))}")
        print(f"Polygons: {len(data.get('polygons', []))}")
    else:
        print("Error Response:", resp.text)

except Exception as e:
    print(f"Request Failed: {e}")
