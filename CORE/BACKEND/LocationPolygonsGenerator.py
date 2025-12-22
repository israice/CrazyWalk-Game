import logging

import os
import math
import time
import requests
import networkx as nx
from shapely.geometry import Polygon
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
    
    def _find_merge_candidate(self, small_poly, all_polys, line_to_polys_map):
        """
        Find a neighboring polygon that shares a boundary white line with small_poly.
        Returns (neighbor_poly, shared_line_id) or (None, None).
        """
        small_lines = set(small_poly.get('boundary_white_lines', []))
        
        for line_id in small_lines:
            # Find all polygons that share this line
            sharing_polys = line_to_polys_map.get(line_id, [])
            for candidate in sharing_polys:
                if candidate['id'] != small_poly['id']:
                    return candidate, line_id
        
        return None, None
    
    def _merge_two_polygons(self, poly_a, poly_b, shared_line_id):
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
            merged_geom = unary_union([geom_a, geom_b])
            
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
            combined_lines = (lines_a | lines_b) - {shared_line_id}
            
            # Sum total points
            total_pts = poly_a.get('total_points', 0) + poly_b.get('total_points', 0)
            
            logger.info(f"_merge_two_polygons: SUCCESS - {poly_a['id']} + {poly_b['id']} -> {len(new_coords)} coords")
            
            return {
                'id': poly_a['id'],  # Keep first polygon's ID
                'coords': new_coords,
                'center': largest_original_center,  # Center of largest original polygon
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

    def generate_map(self, lat, lon, region_size=0.0015, force_rebuild=False):
        """
        Orchestrates the creation of all game elements.
        Includes automatic retry with increasing region sizes.
        """
        logger.info(f">>> generate_map CALLED: lat={lat}, lon={lon}, force_rebuild={force_rebuild}")
        
        # Region sizes: ~166m, ~555m, ~1110m
        REGION_SIZES = [0.0015, 0.005, 0.01]
        
        for attempt, size in enumerate(REGION_SIZES, 1):
            meters = int(size * 111000)
            logger.info("========================================")
            logger.info(f"GPS POLYGON ATTEMPT {attempt}/3: region_size={size} (~{meters}m)")
            logger.info("========================================")
            
            # 1. Red Lines (Roads)
            red_segments, red_visual = self._fetch_red_lines(lat, lon, size, reuse_existing=False)
            
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
            # Build map: line_id -> green_count
            line_green_counts = {}
            for wl in white_lines:
                line_id = wl.get('id')
                line_green_counts[line_id] = wl.get('green_count', 0)
            
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
                # Match polygon vertices with actual blue circle coordinates
                polygon_vertices = set()
                for coord in poly.get('coords', []):
                    vertex_key = (round(coord[0], 7), round(coord[1], 7))
                    polygon_vertices.add(vertex_key)
                
                # Only count vertices that are actual blue circles
                blue_count = len(polygon_vertices & blue_circle_coords)
                
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
            # Collect all unique vertex coordinates from final polygon boundaries
            polygon_boundary_vertices = set()
            for poly in polygons:
                for coord in poly['coords']:
                    # Round to 7 decimal places for comparison
                    vertex_key = (round(coord[0], 7), round(coord[1], 7))
                    polygon_boundary_vertices.add(vertex_key)
            
            original_bc_count = len(blue_circles)
            blue_circles = [
                bc for bc in blue_circles 
                if (round(bc['lat'], 7), round(bc['lon'], 7)) in polygon_boundary_vertices
            ]
            
            if len(blue_circles) != original_bc_count:
                logger.info(f"Filtered internal blue circles: {original_bc_count} -> {len(blue_circles)}")
            
            logger.info("========================================")
            logger.info(f"SUCCESS on attempt {attempt}: {len(polygons)} polygons, {len(blue_circles)} circles, {len(white_lines)} lines")
            logger.info("========================================")
            
            return {
                "red_lines": [],
                "blue_circles": blue_circles,
                "white_lines": white_lines,
                "green_circles": green_circles,
                "polygons": polygons,
                "groups": groups
            }
        
        # Should not reach here, but safety fallback
        return {"error": "UNKNOWN", "message": "Generation failed unexpectedly"}


    def _fetch_red_lines(self, lat, lon, region_size, reuse_existing):
        """Step 1: Fetch from Overpass or Redis"""
        logger.info(f"LocationPolygonsGenerator: Step 1 - Fetching Red Lines for {lat}, {lon}")
        

        
        # Reuse Logic
        if reuse_existing:
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
        for attempt in range(len(servers) * 2):
            url = servers[attempt % len(servers)]
            try:
                # logger.info(f"Requesting from {url}...")
                resp = requests.post(url, data=query, headers=headers, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception:
                time.sleep(1)
        
        if not data:
            logger.error("LocationPolygonsGenerator: Overpass failed.")
            return [], []

        # Process
        nodes = {n['id']: (n['lat'], n['lon']) for n in data['elements'] if n['type'] == 'node'}
        red_visual = []
        red_segments = []
        
        for el in data['elements']:
            if el['type'] == 'way':
                way_nodes = el.get('nodes', [])
                coords = [nodes[nid] for nid in way_nodes if nid in nodes]
                
                if len(coords) > 1:
                    # SIMPLIFIED: Store only path (list of coordinates)
                    # No street names saved.
                    
                    red_visual.append(coords)
                    
                    for i in range(len(coords) - 1):
                        red_segments.append((coords[i], coords[i+1]))



        save_to_redis(KEY_META, {'lat': lat, 'lon': lon})
        save_to_redis(KEY_RED_LINES, red_visual)
        
        return red_segments, red_visual

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
        
        for start_node in relevant_nodes:
            if start_node not in adjacency:
                continue
            for neighbor in adjacency[start_node]:
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
                
                polygons_data.append({
                    'id': f"poly_{len(polygons_data)}",
                    'coords': coords,
                    'center': (center.x, center.y),
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
        if polygons_data:
            original_count = len(polygons_data)
            polygons_data = self._merge_small_polygons(polygons_data)
            if len(polygons_data) != original_count:
                logger.info(f"Polygon merging: {original_count} -> {len(polygons_data)} polygons")
            
        save_to_redis(KEY_POLYGONS, polygons_data)
        
        used_ids = set()
        for p in polygons_data:
            used_ids.update(p['boundary_white_lines'])
            
        return polygons_data, used_ids
    
    def _merge_small_polygons(self, polygons, max_iterations=10):
        """
        Iteratively merge polygons that are too small to fit the white circle label.
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
            
            # Find small polygons
            small_polys = [p for p in polygons if not self._can_fit_circle(p['coords'])]
            
            if not small_polys:
                logger.info(f"Polygon merging: no small polygons found (iteration {iteration})")
                break
            
            logger.info(f"Polygon merging iteration {iteration}: found {len(small_polys)} small polygons")
            
            merged_ids = set()
            new_polygons = []
            
            for poly in polygons:
                if poly['id'] in merged_ids:
                    continue
                
                if not self._can_fit_circle(poly['coords']):
                    # This is a small polygon, try to merge
                    neighbor, shared_line = self._find_merge_candidate(poly, polygons, line_to_polys)
                    
                    if neighbor and neighbor['id'] not in merged_ids:
                        merged = self._merge_two_polygons(poly, neighbor, shared_line)
                        if merged:
                            merged_ids.add(poly['id'])
                            merged_ids.add(neighbor['id'])
                            new_polygons.append(merged)
                            logger.info(f"Merged {poly['id']} + {neighbor['id']} (removed line {shared_line})")
                            continue
                
                # Keep polygon as is
                if poly['id'] not in merged_ids:
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
