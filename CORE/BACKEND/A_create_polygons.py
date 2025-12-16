import logging
import json
from .AA_temp_red_lines import create_red_lines
from .AB_add_blue_circles import create_blue_circles
from .AC_create_white_lines import create_white_lines
from .AD_create_polygons import create_polygons
from .AE_create_group_of_polygons import create_groups_of_polygons

logger = logging.getLogger(__name__)

def run_list(lat, lon, region_size=0.0015):
    """
    Orchestrates the creation of all game elements.
    """
    logger.info("A_create_polygons: Starting generation sequence...")
    
    # 1. Red Lines (Roads) 
    # segments: for logic (building graph)
    # visual: for display (rendering separate ways)
    # Writes to AA_temp_red_lines.csv
    red_segments, red_visual = create_red_lines(lat, lon, region_size)
    if not red_visual:
        return {}

    # 2. Blue Circles (Intersections)
    # Reads from AA_temp_red_lines.csv
    blue_circles, adjacency, relevant_nodes = create_blue_circles()
    
    # 3. White Lines + Green Circles
    # Reads from AB_add_blue_circles.csv
    white_lines, green_circles = create_white_lines()
    
    # 4. Polygons
    # Reads from AC_create_white_lines.csv
    polygons = create_polygons()
    
    # 5. Groups
    # Reads from AD_create_polygons.csv
    groups = create_groups_of_polygons()

    # --- RECALCULATE CONNECTIONS FOR VISUAL ACCURACY ---
    # The 'connections' value in blue_circles currently reflects raw RED segments (noisy).
    # We want it to reflect the visible WHITE lines connected to the node.
    
    # 1. Count connections from White Lines
    wl_node_counts = {}
    for wl in white_lines:
        # white_lines uses 'start' and 'end' keys which are tuples (lat, lon)
        s = wl['start'] 
        e = wl['end']
        wl_node_counts[s] = wl_node_counts.get(s, 0) + 1
        wl_node_counts[e] = wl_node_counts.get(e, 0) + 1
        
    # 2. Update Blue Circles
    for circle in blue_circles:
        # circle is dict: {'id', 'lat', 'lon', 'connections'}
        # Key for lookup matches the tuple format from white lines
        node_key = (circle['lat'], circle['lon'])
        
        # Update with count from white lines (default to 0 if isolated)
        new_count = wl_node_counts.get(node_key, 0)
        circle['connections'] = new_count
        
    # ---------------------------------------------------
    
    
    logger.info(f"A_create_polygons: Generated "
                f"{len(red_visual)} red rays, "
                f"{len(blue_circles)} blue circles, "
                f"{len(white_lines)} white lines, "
                f"{len(polygons)} polygons.")
    
    logger.info("A_create_polygons: Sequence complete.")
    
    return {
        "red_lines": red_visual, # Return full ways for smooth rendering
        "blue_circles": blue_circles,
        "white_lines": white_lines,
        "green_circles": green_circles,
        "polygons": polygons,
        "groups": groups
    }
