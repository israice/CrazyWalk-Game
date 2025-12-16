
import logging
import sys
import os

# Setup path
sys.path.append(os.getcwd())

# Configure logging
logging.basicConfig(level=logging.INFO)

from CORE.BACKEND.AA_temp_red_lines import create_red_lines
from CORE.BACKEND.AB_add_blue_circles import create_blue_circles

def debug_pipeline():
    print("--- 1. Testing AA (Red Lines) ---")
    lat, lon = 32.08055, 34.78018 # Tel Aviv Dizengoff
    
    # Run AA
    # region_size=0.002 to be quick
    segments, visuals = create_red_lines(lat, lon, region_size=0.002)
    
    print(f"AA finished. Visuals found: {len(visuals)}")
    
    # Check CSV
    aa_csv = 'CORE/BACKEND/AA_temp_red_lines.csv'
    if os.path.exists(aa_csv):
        size = os.path.getsize(aa_csv)
        print(f"AA CSV Size: {size} bytes")
    else:
        print("AA CSV does not exist!")
        return

    if len(visuals) == 0:
        print("No red lines found. Aborting.")
        return

    print("\n--- 2. Testing AB (Blue Circles) ---")
    # Run AB (reads from CSV by default if no args passed, or we can pass None)
    # The real pipeline calls create_blue_circles() without args.
    blue_circles, adj, nodes = create_blue_circles()
    
    print(f"AB finished. Blue Circles found: {len(blue_circles)}")
    
    # Check CSV
    ab_csv = 'CORE/BACKEND/AB_add_blue_circles.csv'
    if os.path.exists(ab_csv):
        size = os.path.getsize(ab_csv)
        print(f"AB CSV Size: {size} bytes")
    else:
        print("AB CSV does not exist!")

if __name__ == "__main__":
    debug_pipeline()
