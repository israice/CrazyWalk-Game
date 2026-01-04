import logging

logger = logging.getLogger(__name__)

def enrich_graph_elements(polygons, white_lines, blue_circles, green_circles):
    """
    Calculates connections between graph elements (Blue Circles, White Lines, Green Circles)
    and Polygons.
    Populates stats for UI rendering (e.g. saturation, connected polygon counts).
    
    This operates in-place on the provided lists of dictionaries.
    """
    logger.info("GraphEnricher: Calculating graph connections and stats...")
    
    # --- RECALCULATE CONNECTIONS FOR VISUAL ACCURACY ---
    wl_node_data = {} 
    for wl in white_lines:
        s = tuple(wl['start']) 
        e = tuple(wl['end'])
        lid = wl.get('id', -1)
        
        if s not in wl_node_data:
            wl_node_data[s] = {'count': 0, 'line_ids': []}
        if e not in wl_node_data:
            wl_node_data[e] = {'count': 0, 'line_ids': []}
        
        wl_node_data[s]['count'] += 1
        wl_node_data[s]['line_ids'].append(lid)
        wl_node_data[e]['count'] += 1
        wl_node_data[e]['line_ids'].append(lid)
        
    for circle in blue_circles:
        node_key = (circle['lat'], circle['lon'])
        if node_key in wl_node_data:
            circle['active_connections'] = wl_node_data[node_key]['count']
            circle['connected_white_lines'] = wl_node_data[node_key]['line_ids']
        else:
            circle['active_connections'] = 0
            circle['connected_white_lines'] = []
            
    # Note: We do NOT filter blue_circles here based on active_connections=0 anymore.
    # The original logic filtered them, but maybe we should keep them?
    # Original: blue_circles = [bc for bc in blue_circles if bc['active_connections'] > 0]
    # Since we are operating in-place, we can't filter the list reference easily unless we return it.
    # But wait, identify_intersections (Step 2) already filters for junctions.
    # So unconnected blue circles might be rare?
    # Let's check original logic.
    # "Only keep connected blue circles" - lines 656.
    # If I don't filter, is it bad? 
    # Maybe I should filter them out in the return?
    # Or just mark them?
    # The list is passed by reference. I can modify it: blue_circles[:] = [ ... ]
    
    blue_circles[:] = [bc for bc in blue_circles if bc['active_connections'] > 0]
    
    
    # --- CALCULATE POLYGON CONNECTIONS FOR BLUE CIRCLES ---
    # Map: blue_circle_id -> set(polygon_ids)
    bc_poly_map = {bc['id']: set() for bc in blue_circles}
    
    # Helper: Find blue circle ID by coord
    coord_to_bc_id = {}
    for bc in blue_circles:
        key = (round(bc['lat'], 7), round(bc['lon'], 7))
        coord_to_bc_id[key] = bc['id']
    
    # Helper: Find line by ID to get start/end
    line_map = {wl['id']: wl for wl in white_lines}
    
    for poly in polygons:
        poly_id = poly['id']
        for line_id in poly.get('boundary_white_lines', []):
            wl = line_map.get(line_id)
            if not wl: 
                continue
                
            # Get start and end coords of the white line
            s = wl['start']
            e = wl['end']
            s_key = (round(s[0], 7), round(s[1], 7))
            e_key = (round(e[0], 7), round(e[1], 7))
            
            # If these coords correspond to a blue circle, link the polygon
            if s_key in coord_to_bc_id:
                bc_id = coord_to_bc_id[s_key]
                bc_poly_map[bc_id].add(poly_id)
                
            if e_key in coord_to_bc_id:
                bc_id = coord_to_bc_id[e_key]
                bc_poly_map[bc_id].add(poly_id)
    
    # Update Blue Circles with this data
    for bc in blue_circles:
        connected_polys = list(bc_poly_map.get(bc['id'], []))
        bc['connected_polygon_ids'] = connected_polys
        bc['connected_polygons_count'] = len(connected_polys)
        
        # --- STATS CALCULATION ---
        stats_connected_lines = bc['connected_polygons_count'] * 2
        
        # Clamp
        if stats_connected_lines > bc['connections']:
                stats_connected_lines = bc['connections']
                
        stats_not_connected_lines = bc['connections'] - stats_connected_lines
        if stats_not_connected_lines < 0: stats_not_connected_lines = 0
        
        bc['stats_connected_lines'] = stats_connected_lines
        bc['stats_not_connected_lines'] = stats_not_connected_lines
        bc['stats_connected_polygons'] = bc['connected_polygons_count']
        
        # Missing Polygons = Total Sectors (Lines) - Filled Sectors (Polygons)
        bc['stats_not_connected_polygons'] = max(0, bc['connections'] - bc['connected_polygons_count'])
        
        # Check for saturation
        if bc.get('active_connections', 0) == bc.get('connected_polygons_count', 0) and bc.get('active_connections', 0) > 0:
                bc['is_saturated'] = True
        else:
                bc['is_saturated'] = False

    # --- CALCULATE POLYGON CONNECTIONS FOR WHITE LINES ---
    # Map: white_line_id -> set(polygon_ids)
    wl_poly_map = {wl['id']: set() for wl in white_lines}
    
    for poly in polygons:
        poly_id = poly['id']
        for line_id in poly.get('boundary_white_lines', []):
            if line_id in wl_poly_map:
                wl_poly_map[line_id].add(poly_id)
    
    # Update White Lines with this data
    for wl in white_lines:
        connected_polys = list(wl_poly_map.get(wl['id'], []))
        wl['connected_polygon_ids'] = connected_polys
        wl['connected_polygons_count'] = len(connected_polys)
        
        # --- STATS CALCULATION ---
        wl['stats_connected_polygons'] = len(connected_polys)
        wl['stats_not_connected_polygons'] = max(0, 2 - len(connected_polys))
        wl['connected_polygons_count'] = len(connected_polys)

    # --- CALCULATE POLYGON CONNECTIONS FOR GREEN CIRCLES ---
    for gc in green_circles:
        parent_line_id = gc.get('line_id')
        if parent_line_id and parent_line_id in wl_poly_map:
            connected_polys = list(wl_poly_map[parent_line_id])
            gc['connected_polygon_ids'] = connected_polys
            gc['connected_polygons_count'] = len(connected_polys)
            
            # --- STATS FOR GREEN CIRCLE ---
            gc['stats_connected_polygons'] = len(connected_polys)
            gc['stats_not_connected_polygons'] = max(0, 2 - len(connected_polys))
        else:
            gc['connected_polygon_ids'] = []
            gc['stats_connected_polygons'] = 0
            gc['stats_not_connected_polygons'] = 2 # Worst case (isolated line)
    
    # --- SANITIZE/VALIDATE CONNECTIONS ---
    # Ensure no ghosts
    valid_polygon_ids = set(p['id'] for p in polygons)
    
    # Sanitize White Lines
    for wl in white_lines:
        if 'connected_polygon_ids' in wl:
            original_ids = wl['connected_polygon_ids']
            wl['connected_polygon_ids'] = [pid for pid in original_ids if pid in valid_polygon_ids]
            wl['connected_polygons_count'] = len(wl['connected_polygon_ids'])

    # Sanitize Green Circles
    for gc in green_circles:
        if 'connected_polygon_ids' in gc:
            # Refresh from parent white line if needed, but direct filtering is safer here
            original_ids = gc['connected_polygon_ids']
            gc['connected_polygon_ids'] = [pid for pid in original_ids if pid in valid_polygon_ids]
            gc['connected_polygons_count'] = len(gc['connected_polygon_ids'])

    # Sanitize Blue Circles
    for bc in blue_circles:
        if 'connected_polygon_ids' in bc:
            original_ids = bc['connected_polygon_ids']
            bc['connected_polygon_ids'] = [pid for pid in original_ids if pid in valid_polygon_ids]
            bc['connected_polygons_count'] = len(bc['connected_polygon_ids'])

    # --- CALCULATE NEIGHBOR POLYGONS ---
    # map for fast lookup
    wl_map_raw = {wl['id']: wl for wl in white_lines}
    
    for poly in polygons:
        neighbor_ids = set()
        fully_connected_lines = 0
        missing_lines = 0
        
        for line_id in poly.get('boundary_white_lines', []):
            wl = wl_map_raw.get(line_id)
            if not wl: 
                continue
                
            connections = wl.get('connected_polygon_ids', [])
            conn_count = len(connections)
            
            if conn_count >= 2:
                fully_connected_lines += 1
            else:
                missing_lines += 1
                
            for pid in connections:
                if pid != poly['id']:
                    neighbor_ids.add(pid)
                    
        poly['neighbor_polygon_ids'] = list(neighbor_ids)
        poly['neighbor_polygons_count'] = len(neighbor_ids)
        
        # Store requested display stats
        poly['stats_connected_lines'] = fully_connected_lines
        poly['stats_missing_lines'] = missing_lines
        
        # Log paradox
        if len(neighbor_ids) > 0 and (fully_connected_lines + missing_lines) == 0:
               logger.error(f"STATS PARADOX Poly {poly['id']}: Neighbors={len(neighbor_ids)} but Stats=0/0")

    return True  # Done
