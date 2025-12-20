import sys
import os
import logging

# Setup Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Add module path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from CORE.BACKEND.LocationPolygonsGenerator import LocationPolygonsGenerator  # noqa: E402

# Coordinates (Tel Aviv default or similar)
LAT = 32.05688
LON = 34.76878

def test_generation():
    logger.info("Testing Generation with force_rebuild=True")
    try:
        gen = LocationPolygonsGenerator()
        data = gen.generate_map(LAT, LON, force_rebuild=True)
        
        print("Keys returned:", data.keys())
        print("Polygons count:", len(data.get('polygons', [])))
        print("White Lines count:", len(data.get('white_lines', [])))
        print("Blue Circles count:", len(data.get('blue_circles', [])))
        
        if not data.get('polygons'):
            logger.error("NO POLYGONS GENERATED!")
        else:
            logger.info("SUCCESS: Polygons generated.")
            
    except Exception as e:
        logger.error(f"Generation Failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_generation()

