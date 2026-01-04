import logging
import math
from CORE.BACKEND.uid_utils import generate_uid, UIDPrefix

logger = logging.getLogger(__name__)

class MapFilter:
    def filter_data(self, mode, lat, lon, restored_polygon_ids, polygons, white_lines, blue_circles, green_circles):
        """
        Filters game elements based on visibility rules (initial vs expand mode).
        Recalculates stats for filtered elements.
        """
        if mode not in ['initial', 'expand'] or not polygons:
            return polygons, white_lines, blue_circles, green_circles

        connected_poly_ids = None

        if mode == 'initial':
            # Check if we're restoring previously visible polygons
            if restored_polygon_ids and len(restored_polygon_ids) > 0:
                connected_poly_ids = set(restored_polygon_ids)
                logger.info(f"Initial mode (RESTORE): Restoring {len(restored_polygon_ids)} previously visible polygons")
            else:
                # Find nearest green circle to spawn point
                min_dist = float('inf')
                nearest_gc = None
                for gc in green_circles:
                    dist = ((gc['lat'] - lat) ** 2 + (gc['lon'] - lon) ** 2) ** 0.5
                    if dist < min_dist:
                        min_dist = dist
                        nearest_gc = gc

                if nearest_gc and nearest_gc.get('line_id'):
                    # We need to find which polygons this green circle's line belongs to
                    # Green circles don't store connected_polygon_ids directly initially?
                    # Wait, in the original code, they did?
                    # The original 'green_circles' passed here are raw from graph_builder.
                    # graph_builder output does NOT have 'connected_polygon_ids'.
                    # They are calculated later in generate_map (Step 5+).
                    # Filtering happens AFTER Step 4 but BEFORE the massive stat calc block?
                    # In original generate_map (lines 570+):
                    # Filtering happens stats are calculated on the filtered set!
                    # BUT 'initial' mode logic (lines 1066+) happens way later?
                    # Wait, line 1066 is AFTER "5. Groups" and "Stats Calculation" (lines 628-802)?
                    # let's check the line numbers in previous view.
                    # 570: Filter Orphaned Elements (Sanity)
                    # 584: Recalculate total_points
                    # 630: Recalculate Connections
                    # 1066: Filter for initial/expand mode... 
                    
                    # AHA! The filtering happening at 1066 is the FINAL filtering associated with user interaction.
                    # This implies valid stats were already calculated on the full set?
                    # Yes.
                    
                    if nearest_gc and nearest_gc.get('connected_polygon_ids'):
                         connected_poly_ids = set(nearest_gc['connected_polygon_ids'])
                         logger.info(f"Initial mode: Starting green circle {nearest_gc['id']}, connected polygons: {len(connected_poly_ids)}")

        elif mode == 'expand':
            # Find nearest blue circle to clicked point
            min_dist = float('inf')
            nearest_bc = None
            for bc in blue_circles:
                dist = ((bc['lat'] - lat) ** 2 + (bc['lon'] - lon) ** 2) ** 0.5
                if dist < min_dist:
                    min_dist = dist
                    nearest_bc = bc

            if nearest_bc and nearest_bc.get('connected_polygon_ids'):
                connected_poly_ids = set(nearest_bc['connected_polygon_ids'])
                logger.info(f"Expand mode: Clicked blue circle {nearest_bc['id']}, connected polygons: {len(connected_poly_ids)}")

        if connected_poly_ids:
            # Filter polygons
            filtered_polygons = [p for p in polygons if p['id'] in connected_poly_ids]

            # Collect boundary white line IDs from filtered polygons
            visible_line_ids = set()
            for poly in filtered_polygons:
                if poly.get('boundary_white_lines'):
                    visible_line_ids.update(poly['boundary_white_lines'])

            # Filter white lines
            filtered_white_lines = [wl for wl in white_lines if wl['id'] in visible_line_ids]
            
            # Map for quick lookup
            filtered_polygon_ids = {p['id'] for p in filtered_polygons}

            # Filter Blue Circles
            # Show ONLY circles that are endpoints of visible white lines
            visible_blue_circle_ids = set()
            for wl in filtered_white_lines:
                if wl.get('start_blue_circle_id'):
                    visible_blue_circle_ids.add(wl['start_blue_circle_id'])
                if wl.get('end_blue_circle_id'):
                    visible_blue_circle_ids.add(wl['end_blue_circle_id'])
            
            filtered_blue_circles = []
            for bc in blue_circles:
                if bc['id'] in visible_blue_circle_ids:
                    # RECALCULATE STATS based on filtered set
                    
                    # 1. Connected Polygons (Filter ghosts)
                    original_pids = bc.get('connected_polygon_ids', [])
                    visible_pids = [pid for pid in original_pids if pid in filtered_polygon_ids]
                    bc['connected_polygon_ids'] = visible_pids
                    bc['connected_polygons_count'] = len(visible_pids)
                    
                    # 2. Connected White Lines (Filter ghosts)
                    original_lines = bc.get('connected_white_lines', [])
                    visible_lines = [lid for lid in original_lines if lid in visible_line_ids]
                    visible_lines_count = len(visible_lines)
                    
                    # 3. Recalculate display stats
                    if 'stats_connected_polygons' in bc:
                        bc['stats_connected_polygons'] = len(visible_pids)
                        bc['stats_connected_lines'] = visible_lines_count
                        
                        total_osm = bc.get('connections', 0)
                        bc['stats_not_connected_lines'] = max(0, total_osm - visible_lines_count)
                        bc['stats_not_connected_polygons'] = max(0, total_osm - len(visible_pids))
                        
                        # Saturation check
                        bc['is_saturated'] = (bc['stats_not_connected_polygons'] == 0) and \
                                             (bc['stats_not_connected_lines'] == 0) and \
                                             (bc['stats_connected_lines'] > 0)
                    
                    filtered_blue_circles.append(bc)
            
            # Filter Green Circles
            filtered_green_circles = []
            for gc in green_circles:
                if gc.get('line_id') in visible_line_ids:
                    # Sanitize connections
                    original_pids = gc.get('connected_polygon_ids', [])
                    visible_pids = [pid for pid in original_pids if pid in filtered_polygon_ids]
                    gc['connected_polygon_ids'] = visible_pids
                    gc['connected_polygons_count'] = len(visible_pids)
                    
                    if 'stats_connected_polygons' in gc:
                        gc['stats_connected_polygons'] = len(visible_pids)
                        gc['stats_not_connected_polygons'] = max(0, 2 - len(visible_pids))
                    
                    filtered_green_circles.append(gc)
            
            # Update White Line connections too
            for wl in filtered_white_lines:
                original_pids = wl.get('connected_polygon_ids', [])
                visible_pids = [pid for pid in original_pids if pid in filtered_polygon_ids]
                wl['connected_polygon_ids'] = visible_pids
                wl['connected_polygons_count'] = len(visible_pids)
                
                if 'stats_connected_polygons' in wl:
                    wl['stats_connected_polygons'] = len(visible_pids)
                    wl['stats_not_connected_polygons'] = max(0, 2 - len(visible_pids))

            logger.info(f"{mode.upper()} MODE FILTER: {len(polygons)} -> {len(filtered_polygons)} polygons, "
                       f"{len(white_lines)} -> {len(filtered_white_lines)} lines, "
                       f"{len(blue_circles)} -> {len(filtered_blue_circles)} blue circles")

            return filtered_polygons, filtered_white_lines, filtered_blue_circles, filtered_green_circles

        return polygons, white_lines, blue_circles, green_circles
