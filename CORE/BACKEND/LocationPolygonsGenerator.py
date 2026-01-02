import logging

import os
import math
import time
import concurrent.futures
import requests
import networkx as nx
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union
from .redis_tools import (
    save_to_redis, load_from_redis, 
    KEY_META, KEY_RED_LINES, KEY_BLUE_CIRCLES, KEY_ADJACENCY, 
    KEY_WHITE_LINES, KEY_GREEN_CIRCLES, KEY_POLYGONS, KEY_GROUPS
)

logger = logging.getLogger(__name__)

class LocationPolygonsGenerator:
    """
    Unified generator for CrazyWalk game map data.
    Consolidates previous AA-AE steps into one cohesive flow.
    """
    
    def __init__(self):
        self.data_dir = os.path.dirname(__file__)

    def haversine_distance(self, coord1, coord2):
        R = 6371000 # meters
        lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
        lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
        
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        
        a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c

    def _can_fit_circle(self, coords, radius_meters=15):
        """
        Check if a circle with given radius can fit entirely inside the polygon.
        The white circle label is approximately 30x30 pixels, which at typical zoom
        translates to roughly 15 meters radius.

        Coords are in [lat, lon] format, but Shapely needs (x, y) = (lon, lat).
        """
        try:
            # Swap from [lat, lon] to (lon, lat) for Shapely
            shapely_coords = [(c[1], c[0]) for c in coords]

            poly = Polygon(shapely_coords)
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty or poly.area == 0:
                logger.info(f"_can_fit_circle: empty/zero area polygon")
                return False

            centroid = poly.centroid

            # Check if centroid is inside polygon
            if not poly.contains(centroid):
                logger.info(f"_can_fit_circle: centroid outside polygon")
                return False

            # Calculate minimum distance from centroid to polygon boundary
            boundary = poly.exterior
            min_distance_deg = centroid.distance(boundary)

            # Convert to meters (approximate: 1 degree ≈ 111km at equator)
            min_distance_meters = min_distance_deg * 111000

            fits = min_distance_meters >= radius_meters

            # Always log for debugging
            logger.info(f"_can_fit_circle: min_dist={min_distance_meters:.2f}m, radius={radius_meters}m, fits={fits}")

            return fits
        except Exception as e:
            logger.warning(f"_can_fit_circle error: {e}")
            return True  # Assume fits if check fails

    def _get_blue_lines(self, coords, center, label_direction, boundary_white_lines):
        """
        Get list of white lines that the debug box touches (blue lines).

        Returns:
            set: Set of line IDs that intersect with debug box
        """
        try:
            from shapely.geometry import box as ShapelyBox, LineString

            # Convert to Shapely polygon
            shapely_coords = [(c[1], c[0]) for c in coords]  # Swap to (lon, lat)
            poly = Polygon(shapely_coords)
            if not poly.is_valid:
                poly = poly.buffer(0)

            center_point = (center[1], center[0])  # Swap to (lon, lat) for Shapely
            angle = label_direction.get('angle', 0)

            # Calculate offset for small circle
            offset_distance = 45 / 111000  # 45px ≈ 22.5 meters
            offset_x = math.cos(angle) * offset_distance
            offset_y = math.sin(angle) * offset_distance

            # Calculate bounds of debug box
            small_center_x = center_point[0] + offset_x
            small_center_y = center_point[1] + offset_y

            # Find extremes
            large_radius = 30 / 111000  # 30px radius
            small_radius = 15 / 111000  # 15px radius

            min_x = min(center_point[0] - large_radius, small_center_x - small_radius)
            max_x = max(center_point[0] + large_radius, small_center_x + small_radius)
            min_y = min(center_point[1] - large_radius, small_center_y - small_radius)
            max_y = max(center_point[1] + large_radius, small_center_y + small_radius)

            # Create debug box rectangle
            debug_box = ShapelyBox(min_x, min_y, max_x, max_y)

            # Check which boundary lines intersect with debug box edges
            blue_lines = set()
            debug_box_boundary = debug_box.boundary

            # Check each white line on polygon boundary
            for line_id in boundary_white_lines:
                # We need to check if this line intersects debug box boundary
                # For now, mark as blue if debug box extends outside polygon
                # This is approximation - in practice frontend does precise check
                pass

            # Simple check: if debug box doesn't fit, all lines are potentially blue
            if not poly.contains(debug_box):
                blue_lines = set(boundary_white_lines)

            return blue_lines

        except Exception as e:
            logger.warning(f"_get_blue_lines error: {e}")
            return set()

    def _can_fit_debug_box(self, coords, center, label_direction):
        """
        Check if the debug box (bounding box of both circles) fits entirely inside the polygon.

        Debug box calculation:
        - Large circle: 60px diameter (30px radius)
        - Small circle: 30px diameter (15px radius)
        - Small circle offset: 45px from center in direction of label_direction angle
        - Debug box must encompass both circles

        At zoom level ~17-18, approximately:
        - 120px ≈ 60 meters (worst case)

        Args:
            coords: Polygon coordinates in [lat, lon] format
            center: Polygon center as (lat, lon) tuple
            label_direction: Direction dict with 'angle' in radians

        Returns:
            bool: True if debug box fits entirely inside polygon
        """
        try:
            from shapely.geometry import box as ShapelyBox

            # Convert to Shapely polygon
            shapely_coords = [(c[1], c[0]) for c in coords]  # Swap to (lon, lat)
            poly = Polygon(shapely_coords)
            if not poly.is_valid:
                poly = poly.buffer(0)

            center_point = (center[1], center[0])  # Swap to (lon, lat) for Shapely
            angle = label_direction.get('angle', 0)

            # Calculate debug box size in degrees
            # Worst case: box is 120x120px ≈ 60m x 60m
            # 1 degree ≈ 111km, so 60m ≈ 0.00054 degrees
            box_half_size = 60 / 111000  # meters to degrees

            # Calculate offset for small circle
            offset_distance = 45 / 111000  # 45px ≈ 22.5 meters
            offset_x = math.cos(angle) * offset_distance
            offset_y = math.sin(angle) * offset_distance

            # Calculate bounds of debug box
            # We need to encompass both circles in any direction
            small_center_x = center_point[0] + offset_x
            small_center_y = center_point[1] + offset_y

            # Find extremes
            large_radius = 30 / 111000  # 30px radius
            small_radius = 15 / 111000  # 15px radius

            min_x = min(center_point[0] - large_radius, small_center_x - small_radius)
            max_x = max(center_point[0] + large_radius, small_center_x + small_radius)
            min_y = min(center_point[1] - large_radius, small_center_y - small_radius)
            max_y = max(center_point[1] + large_radius, small_center_y + small_radius)

            # Create debug box rectangle
            debug_box = ShapelyBox(min_x, min_y, max_x, max_y)

            # Check if debug box is entirely within polygon
            fits = poly.contains(debug_box)

            logger.info(f"_can_fit_debug_box: center=({center[0]:.6f}, {center[1]:.6f}), "
                       f"angle={math.degrees(angle):.1f}°, fits={fits}")

            return fits

        except Exception as e:
            logger.warning(f"_can_fit_debug_box error: {e}")
            return True  # Assume fits if check fails

    def _calculate_label_position(self, coords, center):
        """
        Calculate the optimal direction for positioning the small circle.
        Returns the direction angle (in radians) towards the widest part of polygon.

        The small circle should be positioned on the circumference of the large circle,
        in the direction of the polygon's widest/most spacious part, maximizing the
        chance both circles fit inside the polygon.

        Strategy: Sample multiple directions from center and find which direction
        has the maximum distance to polygon boundary.

        Args:
            coords: Polygon coordinates in [lat, lon] format
            center: Polygon center as (lat, lon) tuple

        Returns:
            dict with 'angle' (radians) and 'max_distance' (degrees)
        """
        try:
            if not coords or len(coords) < 3:
                return {'angle': 0, 'max_distance': 0}

            # Convert to Shapely polygon for distance calculations
            shapely_coords = [(c[1], c[0]) for c in coords]  # Swap to (lon, lat)
            poly = Polygon(shapely_coords)
            if not poly.is_valid:
                poly = poly.buffer(0)

            center_point = (center[1], center[0])  # Swap to (lon, lat) for Shapely

            # Sample 8 directions around the center (every 45 degrees) - Optimized from 16
            num_samples = 8
            max_distance = 0
            best_angle = 0
            
            # Pre-calculate boundary once
            boundary = poly.boundary
            from shapely.geometry import Point # Ensure Point is available if not global, though it usually is. 
            # (LineString is imported globally)

            for i in range(num_samples):
                angle = (i * 2 * math.pi) / num_samples

                # Create a ray from center in this direction
                # Project to a far point
                far_distance = 0.01  # ~1km in degrees
                far_point = (
                    center_point[0] + math.cos(angle) * far_distance,
                    center_point[1] + math.sin(angle) * far_distance
                )

                # Create line from center to far point
                # Reuse global LineString
                ray = LineString([center_point, far_point])

                # Find intersection with polygon boundary
                intersection = ray.intersection(boundary)

                # Calculate distance from center to intersection
                if not intersection.is_empty:
                    if intersection.geom_type == 'Point':
                        dist = Point(center_point).distance(intersection)
                        if dist > max_distance:
                            max_distance = dist
                            best_angle = angle
                    elif intersection.geom_type == 'MultiPoint':
                        # Take the closest intersection point
                        min_dist = min(Point(center_point).distance(Point(pt)) for pt in intersection.geoms)
                        if min_dist > max_distance:
                            max_distance = min_dist
                            best_angle = angle

            logger.info(f"_calculate_label_position: center=({center[0]:.6f}, {center[1]:.6f}), "
                       f"max_distance={max_distance * 111000:.2f}m, "
                       f"angle={math.degrees(best_angle):.1f}°")

            return {
                'angle': best_angle,
                'max_distance': max_distance
            }

        except Exception as e:
            logger.warning(f"_calculate_label_position error: {e}, using default")
            return {'angle': 0, 'max_distance': 0}
    
    def _find_merge_candidate(self, small_poly, all_polys, line_to_polys_map, blue_lines):
        """
        Find a neighboring polygon that shares a BLUE LINE (line touched by debug box) with small_poly.
        Only merge through blue lines - lines that the debug box touches.

        Args:
            small_poly: The small polygon to find neighbor for
            all_polys: All polygons
            line_to_polys_map: Map of line_id -> [polygons]
            blue_lines: Set of line IDs that are blue (touched by debug box)

        Returns:
            (neighbor_poly, shared_line_id) or (None, None)
        """
        small_blue_lines = blue_lines.get(small_poly['id'], set())

        # Only consider blue lines (lines touched by debug box)
        if not small_blue_lines:
            return None, None

        # Sort for deterministic merging order
        sorted_lines = sorted(list(small_blue_lines))

        for line_id in sorted_lines:
            # Find all polygons that share this blue line
            sharing_polys = line_to_polys_map.get(line_id, [])
            for candidate in sharing_polys:
                if candidate['id'] != small_poly['id']:
                    return candidate, line_id

        return None, None
    
    def _merge_two_polygons(self, poly_a, poly_b, shared_line_id, white_lines_map):
        """
        Merge two polygons by combining their geometries.
        Returns a new polygon dict with merged data.
        
        Coords are in [lat, lon] format, but Shapely needs (x, y) = (lon, lat).
        
        We track the largest ORIGINAL polygon's center through merge chains.
        """
        try:
            # Swap from [lat, lon] to (lon, lat) for Shapely
            coords_a = [(c[1], c[0]) for c in poly_a['coords']]
            coords_b = [(c[1], c[0]) for c in poly_b['coords']]
            
            geom_a = Polygon(coords_a)
            geom_b = Polygon(coords_b)
            
            if not geom_a.is_valid:
                geom_a = geom_a.buffer(0)
            if not geom_b.is_valid:
                geom_b = geom_b.buffer(0)
            
            # Track largest ORIGINAL polygon area through merge chains
            # For unmerged polygons, use current geometry area
            area_a = poly_a.get('_largest_original_area', geom_a.area)
            area_b = poly_b.get('_largest_original_area', geom_b.area)
            center_a = poly_a.get('_largest_original_center', poly_a.get('center', (0, 0)))
            center_b = poly_b.get('_largest_original_center', poly_b.get('center', (0, 0)))
            
            # Select the larger original polygon's center
            if area_a >= area_b:
                largest_original_area = area_a
                largest_original_center = center_a
                logger.info(f"  -> Using center from poly_a (area {area_a:.2e} >= {area_b:.2e})")
            else:
                largest_original_area = area_b
                largest_original_center = center_b
                logger.info(f"  -> Using center from poly_b (area {area_b:.2e} > {area_a:.2e})")
            
            # Merge using unary_union
            # Use specific precision or small buffer to ensure shared edges dissolve.
            # Floating point issues sometimes prevent edges from merging, leaving "slits".
            # "Morphological Close": Buffer out then buffer in.
            eps = 1e-7
            merged_geom = unary_union([geom_a.buffer(eps), geom_b.buffer(eps)]).buffer(-eps)
            
            if merged_geom.is_empty:
                logger.warning(f"_merge_two_polygons: result is empty")
                return None
            
            # Handle MultiPolygon case (shouldn't happen for adjacent polys, but safety)
            if merged_geom.geom_type == 'MultiPolygon':
                # Take the largest polygon
                merged_geom = max(merged_geom.geoms, key=lambda g: g.area)
                logger.warning(f"_merge_two_polygons: MultiPolygon result, took largest")
            
            # Get new coords and swap back to [lat, lon]
            shapely_coords = list(merged_geom.exterior.coords)
            new_coords = [[c[1], c[0]] for c in shapely_coords]  # Swap back to [lat, lon]
            
            # Combine boundary lines, excluding the shared one
            lines_a = set(poly_a.get('boundary_white_lines', []))
            lines_b = set(poly_b.get('boundary_white_lines', []))
            # Combine boundary lines: symmetric difference removes ALL shared (internal) lines
            combined_lines = lines_a ^ lines_b

            # --- GEOMETRIC VALIDATION FOR GHOST LINES ---
            # Verify that these lines are actually on the new boundary.
            validated_lines = []
            
            # Create a "tube" around the boundary (handles holes too).
            # Relaxed buffer: 4.0e-5 degrees is approx 4-5 meters radius.
            # This ensures we capture lines even if there's drift or they are part of a hole.
            boundary_tube = merged_geom.boundary.buffer(4.0e-5)
            
            for line_id in combined_lines:
                wl = white_lines_map.get(line_id)
                if not wl:
                    continue
                
                # Create the line geometry using the FULL PATH
                # wl['path'] is [[lat, lon], [lat, lon], ...]
                # Shapely needs (lon, lat)
                if 'path' in wl and wl['path']:
                    line_coords = [(p[1], p[0]) for p in wl['path']]
                    ls = LineString(line_coords)
                else:
                    # Fallback to straight line if path missing
                    ls = LineString([(wl['start'][1], wl['start'][0]), (wl['end'][1], wl['end'][0])])
                
                # Calculate Intersection Ratio
                if ls.length == 0:
                    continue
                    
                intersection = boundary_tube.intersection(ls)
                coverage = intersection.length / ls.length
                
                # Relaxed threshold: 0.15 (15%)
                # Allows lines that only partially touch (due to simplifications) but excludes purely internal shortcuts.
                if coverage > 0.15:
                    validated_lines.append(line_id)
                    # logger.info(f"    -> Kept line {line_id} (coverage={coverage:.2f})")
                else:
                    logger.info(f"    -> Removed ghost line {line_id} (coverage={coverage:.2f})")

            combined_lines = validated_lines
            
            # Sum total points from scratch based on kept lines to be accurate?
            # Actually, total_points is simpler to just sum, but if we drop lines we should drop their points?
            # The current logic just sums poly_a + poly_b totals. 
            # But if a line is a "ghost" (internal shared line that didn't fully dissolve?), it should be removed.
            # However, the logic calculates TOTAL AREA points.
            # Ideally we recalculate total_points based on validated_lines later in generate_map.
            # For now, we trust the sum but relying on generate_map's recalculation step is safer.
            # Let's just sum for now.
            total_pts = poly_a.get('total_points', 0) + poly_b.get('total_points', 0)

            # Calculate new center and label direction for merged polygon
            new_center = merged_geom.centroid
            new_center_tuple = (new_center.y, new_center.x)  # Swap back to (lat, lon)

            # Calculate new label direction for the merged polygon
            new_label_direction = self._calculate_label_position(new_coords, new_center_tuple)

            # Generate new stable ID based on new centroid
            clat = round(new_center.y, 5)
            clon = round(new_center.x, 5)
            new_stable_id = f"poly_{clat}_{clon}".replace('.', '')

            logger.info(f"_merge_two_polygons: SUCCESS - {poly_a['id']} + {poly_b['id']} -> {new_stable_id}: {len(new_coords)} coords, {len(combined_lines)} lines")

            return {
                'id': new_stable_id,  # New ID based on new center
                'coords': new_coords,
                'center': new_center_tuple,  # New calculated center
                'label_direction': new_label_direction,  # New calculated direction
                'total_points': total_pts,
                'boundary_white_lines': list(combined_lines),
                'merge_count': poly_a.get('merge_count', 1) + poly_b.get('merge_count', 1),
                '_largest_original_area': largest_original_area,  # Track for future merges
                '_largest_original_center': largest_original_center
            }
        except Exception as e:
            logger.error(f"_merge_two_polygons error: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    def generate_map(self, lat, lon, region_size=0.0015, force_rebuild=False, mode='initial', restored_polygon_ids=None):
        """
        Orchestrates the creation of all game elements.
        Includes automatic retry with increasing region sizes.

        mode: 'initial' (default) or 'expand'
        restored_polygon_ids: List of polygon IDs to restore (for page reload)
        """
        logger.info(f">>> generate_map CALLED: lat={lat}, lon={lon}, force_rebuild={force_rebuild}, mode={mode}, restored_ids={len(restored_polygon_ids) if restored_polygon_ids else 0}")

        # --- CACHE CHECK (only for initial mode, not expand) ---
        # Round coordinates to create consistent cache key (~111m precision)
        cache_lat = round(lat, 3)
        cache_lon = round(lon, 3)
        cache_key = f"map_cache:{cache_lat}_{cache_lon}"
        
        if mode == 'initial' and not force_rebuild:
            cached_data = load_from_redis(cache_key)
            if cached_data:
                logger.info(f"✅ CACHE HIT: Returning cached map data for {cache_key}")
                return cached_data
            else:
                logger.info(f"❌ CACHE MISS: No cached data for {cache_key}, generating...")
        elif mode == 'expand':
            logger.info(f"EXPAND MODE: Skipping cache check, generating new polygons...")
        elif force_rebuild:
            logger.info(f"FORCE REBUILD: Skipping cache, regenerating map...")

        # Region sizes: ~166m, ~555m, ~1110m
        # NOTE: We use normal region size even when restoring. Polygons outside the region
        # won't be restored, but user can re-expand them. Large regions are too slow.
        REGION_SIZES = [0.0015, 0.005, 0.01]

        
        for attempt, size in enumerate(REGION_SIZES, 1):
            meters = int(size * 111000)
            logger.info("========================================")
            logger.info(f"GPS POLYGON ATTEMPT {attempt}/3: region_size={size} (~{meters}m)")
            logger.info("========================================")
            
            # 1. Red Lines (Roads)
            # If expanding, we want to fetch new AND merge with existing.
            # reuse_existing=False usually means "fetch fresh from API".
            # But in expand mode, we want "fetch fresh API" + "merge with Redis".
            red_segments, red_visual = self._fetch_red_lines(lat, lon, size, reuse_existing=False, mode=mode)
            
            if not red_visual and not red_segments:
                logger.warning(f"ATTEMPT {attempt}/3: No roads found for region_size={size}")
                if attempt < len(REGION_SIZES):
                    logger.info("Retrying with larger region...")
                    continue
                else:
                    logger.error("FAILED: No roads found after 3 attempts")
                    return {"error": "NO_ROADS", "message": f"No roads found at ({lat}, {lon}) after 3 attempts with max region ~{meters}m"}
            
            logger.info(f"ATTEMPT {attempt}/3: Found {len(red_visual)} road segments")
            
            # 2. Blue Circles (Intersections)
            blue_circles, adjacency, relevant_nodes = self._identify_intersections()
            logger.info(f"ATTEMPT {attempt}/3: Identified {len(blue_circles)} intersections")
            
            # 3. White Lines + Green Circles
            white_lines, green_circles = self._create_graph_elements()
            logger.info(f"ATTEMPT {attempt}/3: Created {len(white_lines)} white lines, {len(green_circles)} green circles")
            
            # 4. Polygons
            polygons, used_white_line_ids = self._find_polygons()
            
            if not polygons:
                logger.warning(f"ATTEMPT {attempt}/3: No polygons created from roads")
                if attempt < len(REGION_SIZES):
                    logger.info("Retrying with larger region...")
                    continue
                else:
                    logger.error("FAILED: No polygons created after 3 attempts")
                    return {"error": "NO_POLYGONS", "message": f"No polygons created at ({lat}, {lon}) after 3 attempts"}
            
            logger.info(f"ATTEMPT {attempt}/3: Created {len(polygons)} polygons - SUCCESS!")
            
            # --- FILTER ORPHANED ELEMENTS ---
            original_wl_count = len(white_lines)
            original_gc_count = len(green_circles)
            
            # Define normalized set
            used_ids_str = set(str(uid) for uid in used_white_line_ids)

            # Filter
            white_lines = [wl for wl in white_lines if str(wl.get('id')) in used_ids_str]
            green_circles = [gc for gc in green_circles if str(gc.get('line_id')) in used_ids_str]
            
            logger.info(f"Filtered White Lines: {original_wl_count} -> {len(white_lines)}")
            logger.info(f"Filtered Green Circles: {original_gc_count} -> {len(green_circles)}")
            
            # --- RECALCULATE total_points FOR MERGED POLYGONS ---
            # Build map: line_id -> green_count AND line_id -> (start, end)
            line_green_counts = {}
            line_nodes_map = {}
            for wl in white_lines:
                line_id = wl.get('id')
                line_green_counts[line_id] = wl.get('green_count', 0)
                line_nodes_map[line_id] = (wl['start'], wl['end'])
            
            # Build set of all blue circle coordinates (filtered list)
            blue_circle_coords = set()
            for bc in blue_circles:
                bc_key = (round(bc['lat'], 7), round(bc['lon'], 7))
                blue_circle_coords.add(bc_key)
            
            for poly in polygons:
                # Count green circles on boundary white lines
                green_total = 0
                for line_id in poly.get('boundary_white_lines', []):
                    green_total += line_green_counts.get(line_id, 0)
                
                # Count blue circles that are on this polygon's boundary
                # NEW LOGIC: Use TOPOLOGY (white lines) not GEOMETRY (polygon vertices)
                # This fixes issues where merged polygons (buffer) shift coords slightly off the blue circles.
                
                polygon_nodes = set()
                for line_id in poly.get('boundary_white_lines', []):
                     # Find the line object
                     # We can't easily look up by ID in list unless we map it. 
                     # Optimisation: Build map earlier or just loop? 
                     # We built `line_green_counts` earlier, but that only has counts.
                     # We need the START/END nodes of the lines.
                     # Re-use white_lines list? It's filtered.
                     pass
                
                # To do this efficiently, let's map ID -> (start, end) above.
                
                # ... (See below for map creation insertion) ...
                
                # ACTUAL REPLACEMENT BLOCK:
                # Assuming `line_nodes_map` exists (we will add it above this loop)
                polygon_nodes = set()
                for line_id in poly.get('boundary_white_lines', []):
                    if line_id in line_nodes_map:
                        s, e = line_nodes_map[line_id]
                        polygon_nodes.add((round(s[0], 7), round(s[1], 7)))
                        polygon_nodes.add((round(e[0], 7), round(e[1], 7)))
                
                # Intersection of Polygon's nodes (from lines) AND Valid Blue Circles
                blue_count = len(polygon_nodes & blue_circle_coords)
                
                old_total = poly.get('total_points', 0)
                new_total = green_total + blue_count
                
                if old_total != new_total:
                    logger.info(f"Recalculated total_points for {poly['id']}: {old_total} -> {new_total} (greens={green_total}, blues={blue_count})")
                    poly['total_points'] = new_total
            
            # 5. Groups
            groups = self._create_groups()

            # --- RECALCULATE CONNECTIONS FOR VISUAL ACCURACY ---
            wl_node_data = {} 
            for wl in white_lines:
                s = wl['start'] 
                e = wl['end']
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
                    
            # Only keep connected blue circles
            blue_circles = [bc for bc in blue_circles if bc['active_connections'] > 0]
            
            # --- FILTER INTERNAL BLUE CIRCLES (from merged polygons) ---
            # Use valid white_lines to determine which blue circles should be kept.
            # (Shapely simplification might remove vertices from coords, but if the white line exists, its nodes must exist)
            valid_blue_circle_coords = set()
            for wl in white_lines:
                s = wl['start']
                e = wl['end']
                # Round to match the blue circle precision
                valid_blue_circle_coords.add((round(s[0], 7), round(s[1], 7)))
                valid_blue_circle_coords.add((round(e[0], 7), round(e[1], 7)))

            original_bc_count = len(blue_circles)
            blue_circles = [
                bc for bc in blue_circles 
                if (round(bc['lat'], 7), round(bc['lon'], 7)) in valid_blue_circle_coords
            ]
            
            if len(blue_circles) != original_bc_count:
                logger.info(f"Filtered internal blue circles: {original_bc_count} -> {len(blue_circles)}")

            # --- CALCULATE POLYGON CONNECTIONS FOR BLUE CIRCLES ---
            # Map: blue_circle_id -> set(polygon_ids)
            bc_poly_map = {bc['id']: set() for bc in blue_circles}
            
            # Helper: Find blue circle ID by coord
            # Optimisation: Build coord -> id map
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
                
                # --- STATS CALCULATION (User Request) ---
                # "Connected Lines" = Lines forming valid polygons (2 lines per polygon corner)
                # "Not Connected Lines" = Total - Connected
                # "Connected Polygons" = Polygon Count
                # "Not Connected Polygons" = Unused lines (Dead ends or missing sectors)
                
                stats_connected_lines = bc['connected_polygons_count'] * 2
                # Clamp in case of weird geometry (e.g. 1-line loop?), but usually 2.
                if stats_connected_lines > bc['connections']:
                     # Should not happen unless `connections` is under-reported or poly loop is 1 line
                     stats_connected_lines = bc['connections']
                     
                stats_not_connected_lines = bc['connections'] - stats_connected_lines
                if stats_not_connected_lines < 0: stats_not_connected_lines = 0
                
                bc['stats_connected_lines'] = stats_connected_lines
                bc['stats_not_connected_lines'] = stats_not_connected_lines
                bc['stats_connected_polygons'] = bc['connected_polygons_count']
                
                # CORRECT LOGIC: Number of sectors = Number of lines.
                # Missing Polygons = Total Sectors (Lines) - Filled Sectors (Polygons)
                bc['stats_not_connected_polygons'] = bc['connections'] - bc['connected_polygons_count']
                if bc['stats_not_connected_polygons'] < 0:
                     bc['stats_not_connected_polygons'] = 0
                
                # Check for saturation: connections (roads) == connected polygons (loops)
                # If equal, it means every road connected to this intersection is part of a polygon value.
                # UPDATED: Use active_connections (White Lines) instead of raw connections (OSM).
                # This ensures we only count roads that actually exist in the game graph.
                if bc.get('active_connections', 0) == bc.get('connected_polygons_count', 0) and bc.get('active_connections', 0) > 0:
                     bc['is_saturated'] = True
                else:
                     bc['is_saturated'] = False
                     
                # logger.info(f"Blue Circle {bc['id']}: connected to {len(connected_polys)} polygons")

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
                
                # --- STATS CALCULATION (User Request) ---
                # A Line separates 2 regions (max 2 polygons).
                wl['stats_connected_polygons'] = len(connected_polys)
                wl['stats_not_connected_polygons'] = 2 - len(connected_polys)
                if wl['stats_not_connected_polygons'] < 0:
                     wl['stats_not_connected_polygons'] = 0
                wl['connected_polygons_count'] = len(connected_polys)

            # --- CALCULATE POLYGON CONNECTIONS FOR GREEN CIRCLES ---
            # Green circles inherit polygon connections from their parent white line
            for gc in green_circles:
                parent_line_id = gc.get('line_id')
                if parent_line_id and parent_line_id in wl_poly_map:
                    connected_polys = list(wl_poly_map[parent_line_id])
                    gc['connected_polygon_ids'] = connected_polys
                    gc['connected_polygons_count'] = len(connected_polys)
                    
                    # --- STATS FOR GREEN CIRCLE ---
                    # Inherit from line: Max 2 polygons
                    gc['stats_connected_polygons'] = len(connected_polys)
                    gc['stats_not_connected_polygons'] = 2 - len(connected_polys)
                    if gc['stats_not_connected_polygons'] < 0: gc['stats_not_connected_polygons'] = 0
                else:
                    gc['connected_polygon_ids'] = []
                    gc['stats_connected_polygons'] = 0
                    gc['stats_not_connected_polygons'] = 2 # Worst case (isolated line)
            # --- VALIDATE AND SANITIZE CONNECTIONS ---
            # Ensure no "ghost" polygons are referenced in connected_polygon_ids
            # This fixes the issue where White Lines claim to connect to polygons that were not returned/generated
            
            valid_polygon_ids = set(p['id'] for p in polygons)
            
            # Sanitize White Lines
            for wl in white_lines:
                if 'connected_polygon_ids' in wl:
                    original_ids = wl['connected_polygon_ids']
                    # Filter to only include IDs that are in the polygons list
                    wl['connected_polygon_ids'] = [pid for pid in original_ids if pid in valid_polygon_ids]
                    wl['connected_polygons_count'] = len(wl['connected_polygon_ids'])
                    
                    if len(original_ids) != len(wl['connected_polygon_ids']):
                         logger.warning(f"Sanitized White Line {wl['id']}: Removed {len(original_ids) - len(wl['connected_polygon_ids'])} ghost polygon refs")

            # Sanitize Green Circles
            for gc in green_circles:
                 if 'connected_polygon_ids' in gc:
                    # Rerfresh from parent white line to be safe (since WL was just sanitized)
                    parent_line_id = gc.get('line_id')
                    if parent_line_id and parent_line_id in wl_poly_map:
                         # Get the SANITIZED list from the white line object directly if possible, or re-filter
                         # The wl_poly_map might still have ghosts? Yes, wl_poly_map was built earlier.
                         # Safer to re-filter the existing list
                         original_ids = gc['connected_polygon_ids']
                         gc['connected_polygon_ids'] = [pid for pid in original_ids if pid in valid_polygon_ids]
                         gc['connected_polygons_count'] = len(gc['connected_polygon_ids'])

            # Sanitize Blue Circles
            for bc in blue_circles:
                if 'connected_polygon_ids' in bc:
                    original_ids = bc['connected_polygon_ids']
                    bc['connected_polygon_ids'] = [pid for pid in original_ids if pid in valid_polygon_ids]
                    bc['connected_polygons_count'] = len(bc['connected_polygon_ids'])

            # --- CALCULATE NEIGHBOR POLYGONS (Server-Side) ---
            # Now that connections are sanitized, we calculate neighbors here.
            # This replaces client-side calculation in index.html
            
            # map for fast lookup - REVERT TO RAW KEYS (Blue Circle Logic uses raw keys and works)
            wl_map_raw = {wl['id']: wl for wl in white_lines}
            
            for poly in polygons:
                neighbor_ids = set()
                fully_connected_lines = 0
                missing_lines = 0
                
                # Debug specific polygon if needed
                debug_this = False # (poly['id'] == 'some_id')
                
                for line_id in poly.get('boundary_white_lines', []):
                    # Direct lookup (Int matching Int)
                    wl = wl_map_raw.get(line_id)
                    if not wl: 
                        # LOGGING: Why is it missing?
                        if debug_this or (missing_lines + fully_connected_lines == 0):
                             # Only log first few failures per polygon to avoid spam
                             s_line_id = str(line_id)
                             logger.warning(f"STATS DEBUG: Poly {poly['id']} missing line {line_id} (type {type(line_id)}). Map keys sample: {list(wl_map_raw.keys())[:3]}")
                        continue
                        
                    connections = wl.get('connected_polygon_ids', [])
                    conn_count = len(connections)
                    
                    # LOGGING: Trace values
                    # if debug_this:
                    #    logger.info(f"Poly {poly['id']} Line {line_id}: Connections={conn_count} {connections}")

                    # Logic based on user definition
                    if conn_count >= 2:
                        fully_connected_lines += 1
                    else:
                        missing_lines += 1
                        
                    for pid in connections:
                        # Don't list self as neighbor
                        if pid != poly['id']:
                            neighbor_ids.add(pid)
                            
                poly['neighbor_polygon_ids'] = list(neighbor_ids)
                poly['neighbor_polygons_count'] = len(neighbor_ids) # Actual unique neighbor count (for internal logic)
                
                # Store the requested display stats
                poly['stats_connected_lines'] = fully_connected_lines
                poly['stats_missing_lines'] = missing_lines
                
                # LOG VALIDATION FAILURE
                # If we have neighbors but 0 stats, log it!
                if len(neighbor_ids) > 0 and (fully_connected_lines + missing_lines) == 0:
                     logger.error(f"STATS PARADOX Poly {poly['id']}: Neighbors={len(neighbor_ids)} but Stats=0/0. BoundaryLines={len(poly.get('boundary_white_lines', []))}")

            # --- LOGGING FINAL POLYGONS ---
            poly_ids = [p['id'] for p in polygons]
            logger.info(f"FINAL POLYGONS ({len(poly_ids)}): {poly_ids}")

            
            # --- CALCULATE POSTER GRID (3x3 = 9 POSTERS) ---
            # Create a fixed 3x3 grid centered on the geometric center of all polygons
            if polygons:
                # Find bounds of all polygons
                min_lat = float('inf')
                max_lat = float('-inf')
                min_lon = float('inf')
                max_lon = float('-inf')
                
                for poly in polygons:
                    for coord in poly.get('coords', []):
                        coord_lat, coord_lon = coord[0], coord[1]
                        min_lat = min(min_lat, coord_lat)
                        max_lat = max(max_lat, coord_lat)
                        min_lon = min(min_lon, coord_lon)
                        max_lon = max(max_lon, coord_lon)
                
                # Use geometric center of all polygons (not user spawn point)
                center_lat = (min_lat + max_lat) / 2
                center_lon = (min_lon + max_lon) / 2
                
                logger.info(f"Polygon bounds: lat({min_lat:.6f}, {max_lat:.6f}), lon({min_lon:.6f}, {max_lon:.6f})")
                logger.info(f"Geometric center of polygons: lat={center_lat:.6f}, lon={center_lon:.6f}")
                logger.info(f"User spawn point: lat={lat:.6f}, lon={lon:.6f}")
                
                # Fixed poster size (same as before: ~333m lat, ~444m lon)
                POSTER_LAT_SIZE = 0.003
                POSTER_LON_SIZE = 0.004
                
                # 3x3 grid centered on user location
                # Grid layout:
                # [7][8][9]
                # [4][5][6]  <- #5 is at user spawn point
                # [1][2][3]
                
                # Create 3x3 grid centered on user location
                # Grid layout:
                # [7][8][9]
                # [4][5][6]  <- #5 is at user spawn point
                # [1][2][3]
                
                # Starting position: bottom-left corner of grid
                start_lat = center_lat - (1.5 * POSTER_LAT_SIZE)  # Center - 1.5 posters down
                start_lon = center_lon - (1.5 * POSTER_LON_SIZE)  # Center - 1.5 posters left
                
                # Scan for available images in GAME_POSTERS
                posters_dir = os.path.join(self.data_dir, '..', 'DATA', 'GAME_POSTERS')
                valid_extensions = ('.jpg', '.jpeg', '.png')
                available_images = []
                
                if os.path.exists(posters_dir):
                    for f in os.listdir(posters_dir):
                        if f.lower().endswith(valid_extensions):
                            available_images.append(f)
                
                if not available_images:
                    logger.warning("No posters found in GAME_POSTERS! Using default fallback IDs.")
                    # Fallback to simulated IDs if empty (shouldn't happen in prod)
                    available_images = [f"{i}.jpg" for i in range(1, 10)]

                import random
                import secrets
                
                def generate_uid(prefix):
                    """Generate a random UID like POSTER_phy5i6tgz"""
                    return f"{prefix}_{secrets.token_hex(4)}"
                
                # --- POSTER PERSISTENCE ---
                # Check Redis for existing poster assignment for this location
                # Key based on input lat/lon (rounded to ~1m precision to handle float drift)
                poster_cache_key = f"game:posters:{round(lat, 6)}_{round(lon, 6)}"
                cached_selected_images = load_from_redis(poster_cache_key)
                
                if cached_selected_images:
                    logger.info(f"Reusing persisted posters for {lat}, {lon}")
                    selected_images = cached_selected_images
                else:
                    # Select 9 images. 
                    # If we have >= 9, sample unique ones.
                    # If we have < 9, sample with replacement (or just cycle them).
                    if len(available_images) >= 9:
                        selected_images = random.sample(available_images, 9)
                    else:
                        logger.warning(f"Only {len(available_images)} posters found. Repeating to fill grid.")
                        # Fill 9 slots by cycling available images
                        selected_images = [available_images[i % len(available_images)] for i in range(9)]
                        random.shuffle(selected_images) # Shuffle so the pattern isn't obvious
                    
                    # Save to Redis (No expiration, cleared on server start)
                    save_to_redis(poster_cache_key, selected_images, expiration=None)
                    logger.info(f"Persisted new poster selection for {lat}, {lon}")

                logger.info(f"Selected posters for grid: {selected_images}")

                # Create 3x3 grid (9 posters)
                # Assign IDs from top to bottom so #5 is in center
                poster_grid = []
                img_idx = 0
                for row in range(2, -1, -1):  # Start from row 2 (top) down to row 0 (bottom)
                    for col in range(3):
                        # Simple formula: row 2 = IDs 7,8,9; row 1 = IDs 4,5,6; row 0 = IDs 1,2,3
                        poster_id = generate_uid('POSTER')
                        poster_position = row * 3 + col + 1  # Keep numeric position for debugging
                        
                        # Use the randomly selected image
                        image_filename = selected_images[img_idx]
                        img_idx += 1
                        
                        poster = {
                            'id': poster_id,
                            'position': poster_position,  # Numeric position 1-9 for reference
                            'min_lat': start_lat + row * POSTER_LAT_SIZE,
                            'max_lat': start_lat + (row + 1) * POSTER_LAT_SIZE,
                            'min_lon': start_lon + col * POSTER_LON_SIZE,
                            'max_lon': start_lon + (col + 1) * POSTER_LON_SIZE,
                            'image_url': f'/GAME_POSTERS/{image_filename}'
                        }
                        poster_grid.append(poster)
                        
                        # Log each poster for debugging
                        logger.info(f"Poster {poster_id} (pos={poster_position}, row={row}, col={col}): lat({poster['min_lat']:.6f}, {poster['max_lat']:.6f}), lon({poster['min_lon']:.6f}, {poster['max_lon']:.6f})")
                        
                        # Debug: log center poster specifically
                        if poster_position == 5:
                            poster_center_lat = (poster['min_lat'] + poster['max_lat']) / 2
                            poster_center_lon = (poster['min_lon'] + poster['max_lon']) / 2
                            logger.info(f"Poster #5 (center): bounds lat({poster['min_lat']:.6f}, {poster['max_lat']:.6f}), lon({poster['min_lon']:.6f}, {poster['max_lon']:.6f})")
                            logger.info(f"Poster #5 center: lat={poster_center_lat:.6f}, lon={poster_center_lon:.6f}")
                            logger.info(f"User spawn point: lat={center_lat:.6f}, lon={center_lon:.6f}")
                            logger.info(f"Offset: lat_diff={abs(poster_center_lat - center_lat):.6f}, lon_diff={abs(poster_center_lon - center_lon):.6f}")
                
                logger.info(f"Created 3x3 poster grid (9 posters) centered at user spawn: lat={center_lat:.5f}, lon={center_lon:.5f}")
                
                # --- ASSIGN POSTERS TO POLYGONS ---
                # Calculate which posters intersect with each polygon
                for poly in polygons:
                    poly_coords = poly.get('coords', [])
                    if not poly_coords:
                        poly['poster_ids'] = []
                        continue
                    
                    # Get polygon bounds
                    poly_min_lat = min(coord[0] for coord in poly_coords)
                    poly_max_lat = max(coord[0] for coord in poly_coords)
                    poly_min_lon = min(coord[1] for coord in poly_coords)
                    poly_max_lon = max(coord[1] for coord in poly_coords)
                    
                    # Check intersection with each poster
                    intersecting_poster_ids = []
                    for poster in poster_grid:
                        # Simple bounds intersection check
                        intersects = not (poly_max_lat < poster['min_lat'] or 
                                        poly_min_lat > poster['max_lat'] or
                                        poly_max_lon < poster['min_lon'] or 
                                        poly_min_lon > poster['max_lon'])
                        if intersects:
                            intersecting_poster_ids.append(poster['id'])
                    
                    poly['poster_ids'] = intersecting_poster_ids
                
                logger.info(f"Assigned poster IDs to {len(polygons)} polygons")
            else:
                poster_grid = None
            
            logger.info("========================================")
            logger.info(f"SUCCESS on attempt {attempt}: {len(polygons)} polygons, {len(blue_circles)} circles, {len(white_lines)} lines")
            logger.info("========================================")

            # Filter for initial mode - show only polygons connected to spawn point
            # Filter for expand mode - show only polygons connected to clicked blue circle
            if mode in ['initial', 'expand'] and polygons:
                connected_poly_ids = None

                if mode == 'initial':
                    # Check if we're restoring previously visible polygons
                    if restored_polygon_ids and len(restored_polygon_ids) > 0:
                        # Restore all previously visible polygons
                        connected_poly_ids = set(restored_polygon_ids)
                        logger.info(f"Initial mode (RESTORE): Restoring {len(restored_polygon_ids)} previously visible polygons: {restored_polygon_ids}")
                    else:
                        # Find nearest green circle to spawn point (lat, lon)
                        min_dist = float('inf')
                        nearest_gc = None

                        for gc in green_circles:
                            dist = ((gc['lat'] - lat) ** 2 + (gc['lon'] - lon) ** 2) ** 0.5
                            if dist < min_dist:
                                min_dist = dist
                                nearest_gc = gc

                        if nearest_gc and nearest_gc.get('connected_polygon_ids'):
                            connected_poly_ids = set(nearest_gc['connected_polygon_ids'])
                            logger.info(f"Initial mode: Starting green circle {nearest_gc['id']}, connected polygons: {nearest_gc['connected_polygon_ids']}")

                elif mode == 'expand':
                    # Find nearest blue circle to clicked point (lat, lon)
                    min_dist = float('inf')
                    nearest_bc = None

                    for bc in blue_circles:
                        dist = ((bc['lat'] - lat) ** 2 + (bc['lon'] - lon) ** 2) ** 0.5
                        if dist < min_dist:
                            min_dist = dist
                            nearest_bc = bc

                    if nearest_bc and nearest_bc.get('connected_polygon_ids'):
                        connected_poly_ids = set(nearest_bc['connected_polygon_ids'])
                        logger.info(f"Expand mode: Clicked blue circle {nearest_bc['id']}, connected polygons: {nearest_bc['connected_polygon_ids']}")

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

                    # Collect blue circle coordinates from endpoints of visible white lines
                    # IMPORTANT: Normalize white line endpoint coordinates to match blue circles
                    visible_blue_coords = set()
                    for wl in filtered_white_lines:
                        # White line endpoints are [lat, lon] - normalize and replace with new lists
                        wl['start'] = [round(wl['start'][0], 7), round(wl['start'][1], 7)]
                        wl['end'] = [round(wl['end'][0], 7), round(wl['end'][1], 7)]

                        start_key = (wl['start'][0], wl['start'][1])
                        end_key = (wl['end'][0], wl['end'][1])
                        visible_blue_coords.add(start_key)
                        visible_blue_coords.add(end_key)
                        
                        # --- SANITIZE CONNECTIONS FOR FILTERED MODE (Fix for White Line Stats) ---
                        # Only keep connections to filtered_polygons
                        filtered_polygon_ids = {p['id'] for p in filtered_polygons}
                        original_connections = wl.get('connected_polygon_ids', [])
                        visible_connections = [pid for pid in original_connections if pid in filtered_polygon_ids]
                        
                        wl['connected_polygon_ids'] = visible_connections
                        wl['connected_polygons_count'] = len(visible_connections)
                        
                        # Recalculate Stats if they exist
                        if 'stats_connected_polygons' in wl:
                             wl['stats_connected_polygons'] = len(visible_connections)
                             # Not connected = 2 - Connected (clamped)
                             wl['stats_not_connected_polygons'] = 2 - len(visible_connections)
                             if wl['stats_not_connected_polygons'] < 0:
                                  wl['stats_not_connected_polygons'] = 0

                    # Filter blue circles - show ONLY circles that are endpoints of visible white lines
                    # This ensures we only show circles for the filtered polygons
                    filtered_polygon_ids = {p['id'] for p in filtered_polygons}

                    # First, collect existing circles at visible endpoints
                    existing_coords = {}  # coord_key -> blue_circle
                    filtered_blue_circles = []

                    for bc in blue_circles:
                        # Normalize coordinates to 7 decimals to match white line endpoints
                        bc['lat'] = round(bc['lat'], 7)
                        bc['lon'] = round(bc['lon'], 7)
                        bc_key = (bc['lat'], bc['lon'])
                        existing_coords[bc_key] = bc

                        # ONLY show circles that are endpoints of visible white lines
                        if bc_key in visible_blue_coords:
                            # If circle is at endpoint of visible line, ALWAYS show it
                            # Recalculate is_saturated: orange ONLY if connections == visible polygon count
                            total_connections = bc.get('connections', 0)
                            visible_polygon_count = len([pid for pid in bc.get('connected_polygon_ids', []) if pid in filtered_polygon_ids])

                            # Update connected_polygons_count to reflect only VISIBLE polygons
                            bc['connected_polygons_count'] = visible_polygon_count
                            
                            # --- RECALCULATE STATS FOR INITIAL FILTER MODE ---
                            # Only update if stats were previously calculated
                            if 'stats_connected_polygons' in bc:
                                bc['stats_connected_polygons'] = visible_polygon_count
                                # Re-derive line stats
                                bc['stats_connected_lines'] = visible_polygon_count * 2
                                if bc['stats_connected_lines'] > total_connections:
                                    bc['stats_connected_lines'] = total_connections
                                    
                                bc['stats_not_connected_lines'] = total_connections - bc['stats_connected_lines']
                                if bc['stats_not_connected_lines'] < 0: bc['stats_not_connected_lines'] = 0
                                
                                # Re-derive missing sectors
                                bc['stats_not_connected_polygons'] = total_connections - visible_polygon_count
                                if bc['stats_not_connected_polygons'] < 0: bc['stats_not_connected_polygons'] = 0

                            # Circle is saturated (orange) ONLY if ALL its lines belong to visible polygons
                            # If connections != visible_polygon_count, it has lines to hidden polygons (blue - expansion point)
                            bc['is_saturated'] = (total_connections == visible_polygon_count)

                            # Debug logging for first few circles
                            if len(filtered_blue_circles) < 3:
                                logger.info(f"Circle {bc['id']}: connections={total_connections}, visible_polys={visible_polygon_count}, is_saturated={bc['is_saturated']}")

                            filtered_blue_circles.append(bc)

                    # Create missing circles for visible line endpoints (where count == 2 globally)
                    # These are needed for complete polygon display
                    logger.info(f"Checking {len(visible_blue_coords)} visible endpoints against {len(existing_coords)} existing circles")

                    created_count = 0
                    missing_coords = []
                    for coord_key in visible_blue_coords:
                        if coord_key not in existing_coords:
                            missing_coords.append(coord_key)
                            lat, lon = coord_key
                            # Create a simple blue circle for this endpoint
                            new_circle = {
                                'id': f"BC_{lat}_{lon}",
                                'lat': lat,
                                'lon': lon,
                                'connections': 2,  # Assumed straight segment
                                'active_connections': 2,
                                'connected_white_lines': [],
                                'connected_polygon_ids': [],
                                'connected_polygons_count': 0,
                                'is_saturated': False,  # Always blue (not saturated)
                                'uid': f"BLUE_CIRCLE_{lat}_{lon}".replace('.', '_').replace('-', 'm')
                            }
                            filtered_blue_circles.append(new_circle)
                            created_count += 1

                    if created_count > 0:
                        logger.info(f"Created {created_count} blue circles for missing endpoints: {missing_coords[:3]}...")

                    logger.info(f"Total filtered blue circles: {len(filtered_blue_circles)}")

                    # Debug: Log coordinate matching for verification
                    if filtered_white_lines:
                        sample_line = filtered_white_lines[0]
                        logger.info(f"Sample line endpoints (normalized): start={sample_line['start']}, end={sample_line['end']}")
                    if filtered_blue_circles:
                        sample_circle = filtered_blue_circles[0]
                        logger.info(f"Sample circle coords (normalized): lat={sample_circle['lat']}, lon={sample_circle['lon']}")

                    # Filter green circles (only those on visible white lines)
                    line_ids_set = {wl['id'] for wl in filtered_white_lines}
                    filtered_green_circles = [gc for gc in green_circles if gc.get('line_id') in line_ids_set]
                    for gc in filtered_green_circles:
                        # --- SANITIZE CONNECTIONS FOR FILTERED MODE (Fix for Green Circle Stats) ---
                        filtered_polygon_ids = {p['id'] for p in filtered_polygons}
                        original_connections = gc.get('connected_polygon_ids', [])
                        visible_connections = [pid for pid in original_connections if pid in filtered_polygon_ids]
                        
                        gc['connected_polygon_ids'] = visible_connections
                        gc['connected_polygons_count'] = len(visible_connections)
                        
                        # Recalculate Stats if they exist
                        if 'stats_connected_polygons' in gc:
                             gc['stats_connected_polygons'] = len(visible_connections)
                             # Not connected = 2 - Connected (clamped)
                             gc['stats_not_connected_polygons'] = 2 - len(visible_connections)
                             if gc['stats_not_connected_polygons'] < 0:
                                  gc['stats_not_connected_polygons'] = 0

                    logger.info(f"{mode.upper()} MODE FILTER: {len(polygons)} -> {len(filtered_polygons)} polygons, "
                               f"{len(white_lines)} -> {len(filtered_white_lines)} lines, "
                               f"{len(blue_circles)} -> {len(filtered_blue_circles)} blue circles, "
                               f"{len(green_circles)} -> {len(filtered_green_circles)} green circles")

                    # Replace with filtered data
                    polygons = filtered_polygons
                    white_lines = filtered_white_lines
                    blue_circles = filtered_blue_circles
                    green_circles = filtered_green_circles

            result_data = {
                "red_lines": [],
                "blue_circles": blue_circles,
                "white_lines": white_lines,
                "green_circles": green_circles,
                "polygons": polygons,
                "groups": groups,
                "poster_grid": poster_grid
            }
            
            # --- SAVE TO CACHE (only for initial mode) ---
            if mode == 'initial':
                save_to_redis(cache_key, result_data, expiration=86400)  # 24 hours TTL
                logger.info(f"💾 CACHE SAVED: Stored map data in {cache_key}")
            
            return result_data

        
        # Should not reach here, but safety fallback
        return {"error": "UNKNOWN", "message": "Generation failed unexpectedly"}


    def _fetch_red_lines(self, lat, lon, region_size, reuse_existing, mode='initial'):
        """Step 1: Fetch from Overpass or Redis"""
        logger.info(f"LocationPolygonsGenerator: Step 1 - Fetching Red Lines for {lat}, {lon} (mode={mode})")
        
        # Reuse Logic (Only if NOT expanding and reuse is requested)
        if mode == 'initial' and reuse_existing:
            meta = load_from_redis(KEY_META)
            if meta and abs(meta.get('lat', 0) - lat) < 0.0005 and abs(meta.get('lon', 0) - lon) < 0.0005:
                cached_lines = load_from_redis(KEY_RED_LINES)
                if cached_lines:
                     logger.info("LocationPolygonsGenerator: Reusing red lines (Redis match).")
                     return [], cached_lines
            
            # Fallback CSV check
            # (Simplified: if Redis failed but we want reuse, we mostly skip unless deeply needed. 
            #  But logic below keeps fetching if not returned)

        # Fetch New
        min_lat, max_lat = lat - region_size, lat + region_size
        min_lon, max_lon = lon - region_size, lon + region_size
        
        query = f"""
        [out:json][timeout:25];
        (
          way["highway"~"^(residential|primary|secondary|tertiary|unclassified|pedestrian|path|footway|living_street)$"]({min_lat},{min_lon},{max_lat},{max_lon});
        );
        out body;
        >;
        out skel qt;
        """
        
        headers = {'User-Agent': 'CrazyWalk-Game/1.0 (contact@crazywalk.org)'}
        servers = [
            "https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"
        ]
        
        data = None
        
        # Parallel Fetching: Race the servers!
        def fetch_from_server(url):
            try:
                # logger.info(f"Starting request to {url}...")
                resp = requests.post(url, data=query, headers=headers, timeout=15)
                resp.raise_for_status()
                return resp.json(), url
            except Exception as e:
                # logger.warning(f"Request to {url} failed: {e}")
                raise e

        logger.info(f"Racing {len(servers)} Overpass servers simultaneously...")
        
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(servers)) as executor:
            future_to_url = {executor.submit(fetch_from_server, url): url for url in servers}
            
            for future in concurrent.futures.as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    data, successful_url = future.result()
                    logger.info(f"🏆 WINNER: {successful_url} returned data first!")
                    
                    # Cancel other futures (best effort)
                    for f in future_to_url:
                        if f != future:
                            f.cancel()
                    break # Stop waiting
                except Exception as e:
                    logger.warning(f"❌ Server {url} failed or timed out: {e}")
        
        if not data:
            logger.error("LocationPolygonsGenerator: All Overpass servers failed.")
            return [], []

        # Process
        nodes = {n['id']: (n['lat'], n['lon']) for n in data['elements'] if n['type'] == 'node'}
        new_red_visual = []
        new_red_segments = []
        
        for el in data['elements']:
            if el['type'] == 'way':
                way_nodes = el.get('nodes', [])
                coords = [nodes[nid] for nid in way_nodes if nid in nodes]
                
                if len(coords) > 1:
                    # SIMPLIFIED: Store only path (list of coordinates)
                    # No street names saved.
                    
                    new_red_visual.append(coords)
                    
                    for i in range(len(coords) - 1):
                        new_red_segments.append((coords[i], coords[i+1]))

        # MERGING LOGIC
        final_red_visual = new_red_visual
        if mode == 'expand':
            existing_lines = load_from_redis(KEY_RED_LINES) or []
            logger.info(f"Expansion: Merging {len(new_red_visual)} new lines with {len(existing_lines)} existing lines.")
            
            # Simple deduplication strategy: Convert paths to tuples of tuples
            # Be careful with float precision. Rounding needed?
            # For now, let's just append and rely on Python's set for exact matches if we normalize.
            # Actually, `final_red_visual` is a list of lists of lists/tuples.
            
            # Normalize for set comparison: tuple of tuples
            seen_paths = set()
            
            # Helper: normalize path
            def normalize_path(path):
                # path is list of [lat, lon]
                # Convert to tuple of tuples for hashing
                # return tuple((round(p[0], 7), round(p[1], 7)) for p in path)
                
                # Actually, simpler: just use string rep or exact tuple if loaded properly.
                # Redis returns lists.
                if isinstance(path, dict) and 'path' in path:
                     path = path['path']
                return tuple((p[0], p[1]) for p in path)

            combined_visual = []
            
            # Add existing
            for line in existing_lines:
                try:
                    norm = normalize_path(line)
                    if norm not in seen_paths:
                        seen_paths.add(norm)
                        combined_visual.append(line)
                except Exception:
                    pass
            
            # Add new
            new_added_count = 0
            for line in new_red_visual:
                try:
                    norm = normalize_path(line)
                    if norm not in seen_paths:
                        seen_paths.add(norm)
                        combined_visual.append(line)
                        new_added_count += 1
                except Exception:
                    pass
            
            logger.info(f"Expansion Result: {len(combined_visual)} total lines (added {new_added_count} unique new lines).")
            final_red_visual = combined_visual

        save_to_redis(KEY_META, {'lat': lat, 'lon': lon})
        save_to_redis(KEY_RED_LINES, final_red_visual)
        
        return new_red_segments, final_red_visual

    def _identify_intersections(self):
        """Step 2: Blue Circles"""
        logger.info("LocationPolygonsGenerator: Step 2 - Identifing Intersections")
        
        red_lines = []
        # Load from Redis (we utilize the side-effect of Step 1 saving to Redis)
        cached = load_from_redis(KEY_RED_LINES)
        if cached:
            for visual in cached:
                # Handle both old (list) and new (dict) formats
                coords = visual['path'] if isinstance(visual, dict) and 'path' in visual else visual
                if not isinstance(coords, list):
                    continue

                for i in range(len(coords) - 1):
                    p1 = (float(coords[i][0]), float(coords[i][1]))
                    p2 = (float(coords[i+1][0]), float(coords[i+1][1]))
                    red_lines.append((p1, p2))
        
        node_counts = {}
        adjacency = {}
        
        for start, end in red_lines:
            node_counts[start] = node_counts.get(start, 0) + 1
            node_counts[end] = node_counts.get(end, 0) + 1
            
            if start not in adjacency:
                adjacency[start] = set()
            if end not in adjacency:
                adjacency[end] = set()
            adjacency[start].add(end)
            adjacency[end].add(start)
            
        blue_circles = []
        relevant_nodes = set()

        # Create blue circles only for intersections/endpoints (count != 2)
        for node, count in node_counts.items():
            if count != 2:
                blue_circles.append({
                    'id': f"{node[0]}_{node[1]}",
                    'lat': node[0], 'lon': node[1],
                    'connections': count
                })
                relevant_nodes.add(node)
        
        # Redis Save
        save_to_redis(KEY_BLUE_CIRCLES, blue_circles)
        
        # Serialize adjacency for potential legacy needs or debug
        adj_list = []
        visited_edges = set()
        for u, neighbors in adjacency.items():
            for v in neighbors:
                edge = tuple(sorted((u, v)))
                if edge not in visited_edges:
                    visited_edges.add(edge)
                    adj_list.append([u, v])
        save_to_redis(KEY_ADJACENCY, adj_list)
        
        return blue_circles, adjacency, relevant_nodes

    def _create_graph_elements(self):
        """Step 3: White Lines & Green Circles"""
        logger.info("LocationPolygonsGenerator: Step 3 - Creating Graph Elements")
        
        # Need to reconstruct inputs if not passed? 
        # Actually logic says "Reads from Redis" usually. 
        # But we actually computed adjacency in prev step in memory.
        # But wait, to match original flow strictly, we might re-read. 
        # But efficiently, we can't always pass everything if we were strict helpers.
        # But since we are now one class, we *could* pass state.
        # HOWEVER, sticking to Redis load ensures we test that persistence mechanism too?
        # Let's DO load from Redis/CSV to be consistent with "Unify without breaking logic".
        # Better: Recalculate or Carry over?
        # Carrying over is faster. But the previous modules relied on CSV/Redis.
        # Let's use Redis loading implementation to ensure `verify_pipeline` style robust robustness.
        # actually, for performance in "Unified Module", passing in-memory is better.
        # But I'll stick to the "Load from Redis" pattern inside this method for the parts I didn't return fully?
        # Wait, I returned `adjacency` from Step 2. Using that is best.
        # But `_create_graph_elements` assumes it starts fresh? 
        # I'll re-implement the logic using Redis loads to be safe and perfectly match old behavior.
        
        blue_circles = load_from_redis(KEY_BLUE_CIRCLES)
        adj_raw = load_from_redis(KEY_ADJACENCY)
        
        relevant_nodes = set()
        if blue_circles:
            for bc in blue_circles:
                relevant_nodes.add((bc['lat'], bc['lon']))
        
        adjacency = {}
        if adj_raw:
            for pair in adj_raw:
                u = tuple(pair[0])
                v = tuple(pair[1])
                if u not in adjacency:
                    adjacency[u] = set()
                if v not in adjacency:
                    adjacency[v] = set()
                adjacency[u].add(v)
                adjacency[v].add(u)

        white_lines = []
        green_circles = []
        visited = set()
        
        relevant_set = set(relevant_nodes)
        
        # Sort for deterministic iteration
        sorted_relevant_nodes = sorted(list(relevant_nodes))
        
        for start_node in sorted_relevant_nodes:
            if start_node not in adjacency:
                continue
            
            # Sort neighbors for deterministic path finding
            neighbors = sorted(list(adjacency[start_node]))
            for neighbor in neighbors:
                edge_key = tuple(sorted((start_node, neighbor)))
                if edge_key in visited:
                    continue
                
                path = [start_node, neighbor]
                curr = neighbor
                prev = start_node
                dist = self.haversine_distance(start_node, neighbor)
                
                while curr not in relevant_set and len(adjacency.get(curr, [])) == 2:
                    neighbors = adjacency[curr]
                    next_node = next((n for n in neighbors if n != prev), None)
                    if next_node:
                        visited.add(tuple(sorted((curr, next_node))))
                        path.append(next_node)
                        dist += self.haversine_distance(curr, next_node)
                        prev = curr
                        curr = next_node
                    else:
                        break
                
                visited.add(edge_key)
                
                if curr in relevant_set and curr != start_node:
                    wl = {
                        'id': len(white_lines),
                        'start': start_node,
                        'end': curr,
                        'path': path,
                        'length': dist,
                        'green_count': 0
                    }
                    
                    # Green Circles
                    target_spacing = 15.0
                    num = max(1, int(round(dist / target_spacing)))
                    if num > 1:
                        step = dist / num
                        targets = [step * k for k in range(1, num)]
                        t_idx = 0
                        curr_dist = 0
                        
                        count = 0
                        for i in range(len(path) - 1):
                            p1, p2 = path[i], path[i+1]
                            seg = self.haversine_distance(p1, p2)
                            while t_idx < len(targets) and (curr_dist + seg) >= targets[t_idx]:
                                rem = targets[t_idx] - curr_dist
                                ratio = rem / seg if seg > 0 else 0
                                nlat = p1[0] + (p2[0] - p1[0]) * ratio
                                nlon = p1[1] + (p2[1] - p1[1]) * ratio
                                green_circles.append({
                                    'id': f"gc_{wl['id']}_{count}",
                                    'lat': nlat, 'lon': nlon, 
                                    'line_id': wl['id']
                                })
                                count += 1
                                t_idx += 1
                            curr_dist += seg
                        wl['green_count'] = count
                    
                    white_lines.append(wl)
                    
        save_to_redis(KEY_WHITE_LINES, white_lines)
        save_to_redis(KEY_GREEN_CIRCLES, green_circles)
        
        return white_lines, green_circles

    def _find_polygons(self):
        """Step 4: Find Polygons"""
        logger.info("LocationPolygonsGenerator: Step 4 - Finding Polygons")
        
        white_lines = load_from_redis(KEY_WHITE_LINES)
        G = nx.Graph()
        if white_lines:
            for wl in white_lines:
                u = tuple(wl['start'])
                v = tuple(wl['end'])
                path_tuples = [tuple(p) for p in wl['path']]
                G.add_edge(u, v, path=path_tuples, 
                           green_count=wl.get('green_count', 0), 
                           line_id=wl.get('id', -1))
        
        polygons_data = []
        try:
            cycles = nx.minimum_cycle_basis(G)
            for cycle in cycles:
                if len(cycle) < 3:
                    continue
                coords = []
                b_ids = set()
                total_pts = len(cycle) # + green circles
                
                cycle_closed = cycle + [cycle[0]]
                for i in range(len(cycle_closed) - 1):
                    u, v = cycle_closed[i], cycle_closed[i+1]
                    ed = G.get_edge_data(u, v)
                    if not ed: 
                        current = [u, v]
                    else:
                        path = ed['path']
                        total_pts += ed.get('green_count', 0)
                        if ed.get('line_id') != -1:
                            b_ids.add(ed['line_id'])
                        
                        if path[0] == u:
                            current = path[:-1]
                        elif path[-1] == u:
                            current = path[::-1][:-1]
                        else:
                            current = path[:-1]
                    coords.extend(current)
                
                if coords:
                    coords.append(coords[0])
                
                poly = Polygon(coords)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                center = poly.centroid

                # STABLE ID GENERATION (2025-12-28)
                # Use hash of centroid coordinates (rounded) to ensure ID persists across rebuilds/expansions.
                # Format: poly_LAT_LON
                # Rounding to 5 decimal places (~1.1 meter precision) to handle minor drift during regeneration
                clat = round(center.x, 5)
                clon = round(center.y, 5)

                # Use simple coordinate string as ID to be readable and unique
                stable_id = f"poly_{clat}_{clon}".replace('.', '')
                
                # --- AREA FILTER (2025-12-31) ---
                # discard sliver/invisible polygons (< ~50m^2)
                # 1 degree ~ 111,000m. 
                # 1 m^2 ~ (1/111000)^2 ~ 8e-11 deg^2
                # Threshold 2e-9 deg^2 is roughly 25-50 m^2.
                # LOGGING: Trace area
                # logger.info(f"Poly Candidate: area={poly.area:.2e} (~{poly.area/8e-11:.1f} m2)")
                
                if poly.area < 2e-9:
                     # logger.warning(f"Discarding sliver polygon. Area={poly.area:.2e}")
                     continue
                
                # Check for Massive Polygons (Ghosts?)
                # Threshold: 1e-4 deg^2 (approx 1.2M m2 -> 1km x 1km box)
                if poly.area > 1e-4:
                     logger.warning(f"GHOST DETECTED? Massive Polygon {stable_id}: Area={poly.area:.2e} (~{poly.area/8e-11:.0f} m2)")
                     # Optional: Filter it?
                     # continue

                # Debug log for ID generation
                # logger.info(f"Generated Stable ID: {stable_id} for centroid ({center.x}, {center.y})")

                # Calculate optimal label direction (towards longest edge)
                center_tuple = (center.x, center.y)
                label_direction = self._calculate_label_position(coords, center_tuple)

                polygons_data.append({
                    'id': stable_id,
                    'coords': coords,
                    'center': center_tuple,
                    'label_direction': label_direction,  # NEW: Direction info for small circle positioning
                    'total_points': total_pts,
                    'boundary_white_lines': list(b_ids),
                    'merge_count': 1
                })
        except Exception as e:
            import traceback
            logger.error(f"LocationPolygonsGenerator: Polygon error type: {type(e)}")
            logger.error(f"LocationPolygonsGenerator: Polygon error trace: {traceback.format_exc()}")
            logger.error(f"LocationPolygonsGenerator: Polygon error: {e}")
        
        # --- MERGE SMALL POLYGONS ---
        # DISABLED: Polygon merging disabled (2025-12-28)
        # if polygons_data:
        #     white_lines_map = {wl['id']: wl for wl in white_lines}
        #     original_count = len(polygons_data)
        #     polygons_data = self._merge_small_polygons(polygons_data, white_lines_map)
        #     if len(polygons_data) != original_count:
        #         logger.info(f"Polygon merging: {original_count} -> {len(polygons_data)} polygons")
            
        # --- ASSIGN PROMO GIFS (PERSISTENT) ---
        # Scan available GIFs
        promos_dir = os.path.join(self.data_dir, '..', 'DATA', 'GAME_PROMOS')
        promo_gifs = []
        if os.path.exists(promos_dir):
            promo_gifs = [f for f in os.listdir(promos_dir) if f.lower().endswith('.gif')]
            
        if promo_gifs:
            import random
            for poly in polygons_data:
                # Use stable ID for persistence
                poly_id = poly['id']
                redis_key = f"game:promo_assignment:{poly_id}"
                
                # Check Redis
                assigned_gif = load_from_redis(redis_key)
                
                if not assigned_gif:
                    # Pick new random
                    assigned_gif = random.choice(promo_gifs)
                    save_to_redis(redis_key, assigned_gif)
                    # logger.info(f"Assigned NEW Promo GIF {assigned_gif} to {poly_id}")
                # else:
                    # logger.info(f"Reusing Promo GIF {assigned_gif} for {poly_id}")
                    
                poly['promo_gif'] = assigned_gif
        else:
            logger.warning("No Promo GIFs found in CORE/DATA/GAME_PROMOS")

        save_to_redis(KEY_POLYGONS, polygons_data)
        
        used_ids = set()
        for p in polygons_data:
            used_ids.update(p['boundary_white_lines'])
            
        return polygons_data, used_ids
    
    def _merge_small_polygons(self, polygons, white_lines_map, max_iterations=10):
        """
        Iteratively merge polygons through blue lines (lines touched by debug box).
        Only merges if two polygons share a blue line.
        Also removes polygons that have no neighbors through blue lines.
        Returns the updated list of polygons with small ones merged into neighbors.
        """
        for iteration in range(max_iterations):
            # Build line -> polygons map
            line_to_polys = {}
            for poly in polygons:
                for line_id in poly.get('boundary_white_lines', []):
                    if line_id not in line_to_polys:
                        line_to_polys[line_id] = []
                    line_to_polys[line_id].append(poly)

            # Calculate blue lines for each polygon (lines touched by debug box)
            blue_lines = {}  # poly_id -> set of blue line IDs
            for p in polygons:
                label_dir = p.get('label_direction', {'angle': 0})
                poly_blue_lines = self._get_blue_lines(
                    p['coords'],
                    p['center'],
                    label_dir,
                    p.get('boundary_white_lines', [])
                )
                if poly_blue_lines:
                    blue_lines[p['id']] = poly_blue_lines
                    logger.info(f"Polygon {p['id']} has {len(poly_blue_lines)} blue lines")

            # Find polygons with blue lines
            polys_with_blue_lines = [p for p in polygons if p['id'] in blue_lines]

            if not polys_with_blue_lines:
                logger.info(f"Polygon merging: no polygons with blue lines (iteration {iteration})")
                break

            logger.info(f"Polygon merging iteration {iteration}: found {len(polys_with_blue_lines)} polygons with blue lines")

            merged_ids = set()
            removed_ids = set()  # Track polygons removed (no neighbors)
            new_polygons = []

            for poly in polygons:
                if poly['id'] in merged_ids or poly['id'] in removed_ids:
                    continue

                # Check if this polygon has blue lines
                if poly['id'] in blue_lines:
                    # This polygon has blue lines, try to merge through blue line
                    neighbor, shared_line = self._find_merge_candidate(poly, polygons, line_to_polys, blue_lines)

                    if neighbor and neighbor['id'] not in merged_ids and neighbor['id'] not in removed_ids:
                        # Merge with neighbor through blue line
                        merged = self._merge_two_polygons(poly, neighbor, shared_line, white_lines_map)
                        if merged:
                            merged_ids.add(poly['id'])
                            merged_ids.add(neighbor['id'])
                            new_polygons.append(merged)
                            logger.info(f"Merged {poly['id']} + {neighbor['id']} (removed BLUE line {shared_line})")
                            continue
                    else:
                        # No neighbor found through blue lines - this is a border polygon, remove it
                        removed_ids.add(poly['id'])
                        logger.info(f"Removed polygon {poly['id']} (no neighbor through blue lines)")
                        continue

                # Keep polygon as is (no blue lines)
                if poly['id'] not in merged_ids and poly['id'] not in removed_ids:
                    new_polygons.append(poly)
            
            if not merged_ids:
                # No merges happened, stop
                break
            
            polygons = new_polygons
        
        return polygons

    def _create_groups(self):
        """Step 5: Groups"""
        logger.info("LocationPolygonsGenerator: Step 5 - Grouping")
        
        polygons = load_from_redis(KEY_POLYGONS)
        shapely_sources = []
        if polygons:
             for p in polygons:
                cs = [tuple(c) for c in p['coords']]
                if len(cs) >= 3:
                    shp = Polygon(cs)
                    if not shp.is_valid:
                        shp = shp.buffer(0)
                    shapely_sources.append({'id': p['id'], 'geom': shp})
        
        groups = []
        if shapely_sources:
            try:
                union_geom = unary_union([s['geom'] for s in shapely_sources])
                
                geoms = []
                if union_geom.geom_type == 'Polygon':
                    geoms = [union_geom]
                elif union_geom.geom_type == 'MultiPolygon':
                    geoms = list(union_geom.geoms)
                
                for idx, g in enumerate(geoms):
                    boundary = list(g.exterior.coords)
                    m_ids = []
                    for s in shapely_sources:
                        if g.intersects(s['geom']):
                             try:
                                 if g.intersection(s['geom']).area > 1e-9:
                                     m_ids.append(s['id'])
                             except Exception:
                                 pass
                    groups.append({
                        'id': f"area_{idx}",
                        'coords': boundary,
                        'type': 'monolith',
                        'polygon_ids': m_ids
                    })
            except Exception as e:
                logger.error(f"LocationPolygonsGenerator: Grouping error: {e}")
                
        save_to_redis(KEY_GROUPS, groups)
        return groups
