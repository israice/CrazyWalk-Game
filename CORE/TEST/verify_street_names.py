
import sys
import os

# Add project root to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from CORE.BACKEND.LocationPolygonsGenerator import LocationPolygonsGenerator

def test_street_names():
    print("Testing Street Name Extraction...")
    
    # Use a location known to have English names (e.g. Empire State Building area)
    lat, lon = 40.748817, -73.985428 
    
    generator = LocationPolygonsGenerator()
    
    # Force rebuild to ensure we fetch from Overpass and not stale Redis
    print(f"Generating map for {lat}, {lon}...")
    data = generator.generate_map(lat, lon, force_rebuild=True)
    
    red_lines = data.get('red_lines', [])
    print(f"Received {len(red_lines)} red lines.")
    
    names_found = 0
    
    for line in red_lines:
        if isinstance(line, dict):
            name = line.get('name')
            if name:
                names_found += 1
                # Check for typical English characters (heuristic) if needed, 
                # but we trusted the generator prioritized 'name:en'
                print(f"Found Name: {name}")
                
    
    if names_found > 0:
        print(f"SUCCESS: Found {names_found} street names.")
        return True
    else:
        print("FAILURE: No street names found.")
        return False

if __name__ == "__main__":
    test_street_names()
