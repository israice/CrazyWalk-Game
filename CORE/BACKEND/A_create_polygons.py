import logging
import json
from .AA_temp_red_lines import create_red_lines
from .AB_add_blue_circles import create_blue_circles
from .AC_create_white_lines import create_white_lines
from .AD_create_polygons import create_polygons
from .AE_create_group_of_polygons import create_groups_of_polygons

logger = logging.getLogger(__name__)

def run_list(lat, lon, region_size=0.0015, force_rebuild=False):
    """
    Orchestrates the creation of all game elements.
    """
    logger.info("A_create_polygons: Starting generation sequence...")
    
    # 1. Red Lines (Roads) 
    # segments: for logic (building graph)
    # visual: for display (rendering separate ways)
    # Writes to AA_temp_red_lines.csv
    red_segments, red_visual = create_red_lines(lat, lon, region_size, reuse_existing=not force_rebuild)
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
    # 4. Polygons
    # Reads from AC_create_white_lines.csv
    # AD returns tuple: (polygons_data, used_white_line_ids)
    polygons, used_white_line_ids = create_polygons()
    
    # --- FILTER ORPHANED LINES ---
    original_wl_count = len(white_lines)
    original_gc_count = len(green_circles)
    
    # DEBUG: Inspect types
    if white_lines:
        first_id = white_lines[0].get('id')
        logger.info(f"DEBUG: Sample WL ID: {first_id} (Type: {type(first_id)})")
        logger.info(f"DEBUG: Sample WL ID (str): {str(first_id)}")
    
    if used_white_line_ids:
        sample_used = list(used_white_line_ids)[0]
        logger.info(f"DEBUG: Sample Used ID: {sample_used} (Type: {type(sample_used)})")
        logger.info(f"DEBUG: Used IDs Set Size: {len(used_white_line_ids)}")
    else:
        logger.warning("DEBUG: used_white_line_ids is EMPTY!")
        
    # Check overlap
    overlap_count = sum(1 for wl in white_lines if str(wl.get('id')) in used_white_line_ids)
    logger.info(f"DEBUG: Overlap Count: {overlap_count}")

    # Keep white lines only if their ID is in the used set
    # AD returns IDs as strings (from CSV). AC returns IDs as ints.
    # We must cast to string for comparison.
    white_lines = [wl for wl in white_lines if str(wl.get('id')) in used_white_line_ids]
    
    # Keep green circles only if their line_id is in the used set
    green_circles = [gc for gc in green_circles if str(gc.get('line_id')) in used_white_line_ids]
    
    logger.info(f"A: Filtered White Lines: {original_wl_count} -> {len(white_lines)}")
    logger.info(f"A: Filtered Green Circles: {original_gc_count} -> {len(green_circles)}")
    # -----------------------------
    
    # 5. Groups
    # Reads from AD_create_polygons.csv
    groups = create_groups_of_polygons()

    # --- RECALCULATE CONNECTIONS FOR VISUAL ACCURACY ---
    # The 'connections' value in blue_circles currently reflects raw RED segments (noisy).
    # We want it to reflect the visible WHITE lines connected to the node.
    
    # 1. Count connections and collect IDs from White Lines
    wl_node_data = {} # Key: (lat, lon) -> {count: 0, line_ids: []}
    
    for wl in white_lines:
        # white_lines uses 'start' and 'end' keys which are tuples (lat, lon)
        s = wl['start'] 
        e = wl['end']
        lid = wl.get('id', -1)
        
        if s not in wl_node_data: wl_node_data[s] = {'count': 0, 'line_ids': []}
        if e not in wl_node_data: wl_node_data[e] = {'count': 0, 'line_ids': []}
        
        wl_node_data[s]['count'] += 1
        wl_node_data[s]['line_ids'].append(lid)
        
        wl_node_data[e]['count'] += 1
        wl_node_data[e]['line_ids'].append(lid)
        
    # 2. Update Blue Circles
    for circle in blue_circles:
        # circle is dict: {'id', 'lat', 'lon', 'connections'}
        # Key for lookup matches the tuple format from white lines
        node_key = (circle['lat'], circle['lon'])
        
        # Update with count from white lines (default to 0 if isolated)
        if node_key in wl_node_data:
            circle['connections'] = wl_node_data[node_key]['count']
            circle['connected_white_lines'] = wl_node_data[node_key]['line_ids']
        else:
            circle['connections'] = 0
            circle['connected_white_lines'] = []
            
    # FILTER BLUE CIRCLES: distinct step after update
    # Only keep intersections that are actually part of the playable network
    blue_circles = [bc for bc in blue_circles if bc['connections'] > 0]
            
    # ---------------------------------------------------
    
    
    logger.info(f"A_create_polygons: Generated "
                f"{len(red_visual)} red rays (suppressed), "
                f"{len(blue_circles)} blue circles, "
                f"{len(white_lines)} white lines, "
                f"{len(polygons)} polygons.")
    
    logger.info("A_create_polygons: Sequence complete.")
    
    return {
        "red_lines": [], # Suppress raw red lines to clean up map
        "blue_circles": blue_circles,
        "white_lines": white_lines,
        "green_circles": green_circles,
        "polygons": polygons,
        "groups": groups
    }
