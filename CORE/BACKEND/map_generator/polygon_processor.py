import logging
import os
import random
import traceback
import networkx as nx
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union

from CORE.BACKEND.redis_tools import (
    save_to_redis, load_from_redis,
    KEY_WHITE_LINES, KEY_POLYGONS, KEY_GROUPS
)
from CORE.BACKEND.uid_utils import generate_uid, UIDPrefix
from .geometry_utils import calculate_label_position, get_blue_lines

logger = logging.getLogger(__name__)

class PolygonProcessor:
    def __init__(self, data_dir):
        self.data_dir = data_dir

    def find_polygons(self):
        """Step 4: Find Polygons"""
        logger.info("PolygonProcessor: Step 4 - Finding Polygons")
        
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
                        path_geometry = ed['path']
                        total_pts += ed.get('green_count', 0)
                        if ed.get('line_id') != -1:
                            b_ids.add(ed['line_id'])
                        
                        if path_geometry[0] == u:
                            current = path_geometry[:-1]
                        elif path_geometry[-1] == u:
                            current = path_geometry[::-1][:-1]
                        else:
                            current = path_geometry[:-1]
                    coords.extend(current)
                
                if coords:
                    coords.append(coords[0])
                
                poly = Polygon(coords)
                if not poly.is_valid:
                    poly = poly.buffer(0)
                center = poly.centroid

                stable_id = generate_uid(UIDPrefix.POLYGON)
                
                if poly.area < 2e-9:
                     # logger.warning(f"Discarding sliver polygon. Area={poly.area:.2e}")
                     continue
                
                if poly.area > 1e-4:
                     logger.warning(f"GHOST DETECTED? Massive Polygon {stable_id}: Area={poly.area:.2e} (~{poly.area/8e-11:.0f} m2)")
                     # continue

                center_tuple = (center.x, center.y)
                label_direction = calculate_label_position(coords, center_tuple)

                polygons_data.append({
                    'id': stable_id,
                    'coords': coords,
                    'center': center_tuple,
                    'label_direction': label_direction,
                    'total_points': total_pts,
                    'boundary_white_lines': list(b_ids),
                    'merge_count': 1
                })
        except Exception as e:
            logger.error(f"PolygonProcessor: Polygon error type: {type(e)}")
            logger.error(f"PolygonProcessor: Polygon error trace: {traceback.format_exc()}")
            logger.error(f"PolygonProcessor: Polygon error: {e}")
        
        # --- MERGE SMALL POLYGONS ---
        # DISABLED: Polygon merging disabled (2025-12-28)
        # if polygons_data:
        #     white_lines_map = {wl['id']: wl for wl in white_lines}
        #     original_count = len(polygons_data)
        #     polygons_data = self.merge_small_polygons(polygons_data, white_lines_map)
        #     if len(polygons_data) != original_count:
        #         logger.info(f"Polygon merging: {original_count} -> {len(polygons_data)} polygons")
            
        # --- ASSIGN PROMO GIFS (PERSISTENT) ---
        promos_dir = os.path.join(self.data_dir, '..', 'DATA', 'GAME_PROMOS')
        promo_gifs = []
        if os.path.exists(promos_dir):
            try:
                promo_gifs = [f for f in os.listdir(promos_dir) if f.lower().endswith('.gif')]
            except Exception:
                pass
            
        if promo_gifs:
            for poly in polygons_data:
                poly_id = poly['id']
                redis_key = f"game:promo_assignment:{poly_id}"
                
                assigned_gif = load_from_redis(redis_key)
                
                if not assigned_gif:
                    assigned_gif = random.choice(promo_gifs)
                    save_to_redis(redis_key, assigned_gif)
                    
                poly['promo_gif'] = assigned_gif
        else:
            logger.warning("No Promo GIFs found in CORE/DATA/GAME_PROMOS")

        save_to_redis(KEY_POLYGONS, polygons_data)
        
        used_ids = set()
        for p in polygons_data:
            used_ids.update(p['boundary_white_lines'])
            
        return polygons_data, used_ids

    def merge_small_polygons(self, polygons, white_lines_map, max_iterations=10):
        """
        Iteratively merge polygons through blue lines (lines touched by debug box).
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
                poly_blue_lines = get_blue_lines(
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

    def _find_merge_candidate(self, small_poly, all_polys, line_to_polys_map, blue_lines):
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
                # logger.info(f"  -> Using center from poly_a (area {area_a:.2e} >= {area_b:.2e})")
            else:
                largest_original_area = area_b
                largest_original_center = center_b
                # logger.info(f"  -> Using center from poly_b (area {area_b:.2e} > {area_a:.2e})")
            
            # Merge using unary_union
            eps = 1e-7
            merged_geom = unary_union([geom_a.buffer(eps), geom_b.buffer(eps)]).buffer(-eps)
            
            if merged_geom.is_empty:
                logger.warning(f"_merge_two_polygons: result is empty")
                return None
            
            # Handle MultiPolygon case
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
            combined_lines = lines_a ^ lines_b

            # --- GEOMETRIC VALIDATION FOR GHOST LINES ---
            validated_lines = []
            
            # Create a "tube" around the boundary (handles holes too).
            boundary_tube = merged_geom.boundary.buffer(4.0e-5)
            
            for line_id in combined_lines:
                wl = white_lines_map.get(line_id)
                if not wl:
                    continue
                
                if 'path' in wl and wl['path']:
                    line_coords = [(p[1], p[0]) for p in wl['path']]
                    ls = LineString(line_coords)
                else:
                    ls = LineString([(wl['start'][1], wl['start'][0]), (wl['end'][1], wl['end'][0])])
                
                if ls.length == 0:
                    continue
                    
                intersection = boundary_tube.intersection(ls)
                coverage = intersection.length / ls.length
                
                if coverage > 0.15:
                    validated_lines.append(line_id)
                else:
                    logger.info(f"    -> Removed ghost line {line_id} (coverage={coverage:.2f})")

            combined_lines = validated_lines
            
            total_pts = poly_a.get('total_points', 0) + poly_b.get('total_points', 0)

            # Calculate new center and label direction for merged polygon
            new_center = merged_geom.centroid
            new_center_tuple = (new_center.y, new_center.x)  # Swap back to (lat, lon)

            # Calculate new label direction for the merged polygon
            new_label_direction = calculate_label_position(new_coords, new_center_tuple)

            clat = round(new_center.y, 5)
            clon = round(new_center.x, 5)
            new_stable_id = f"poly_{clat}_{clon}".replace('.', '')

            # logger.info(f"_merge_two_polygons: SUCCESS - {poly_a['id']} + {poly_b['id']} -> {new_stable_id}")

            return {
                'id': new_stable_id,
                'coords': new_coords,
                'center': new_center_tuple,
                'label_direction': new_label_direction,
                'total_points': total_pts,
                'boundary_white_lines': list(combined_lines),
                'merge_count': poly_a.get('merge_count', 1) + poly_b.get('merge_count', 1),
                '_largest_original_area': largest_original_area,
                '_largest_original_center': largest_original_center
            }
        except Exception as e:
            logger.error(f"_merge_two_polygons error: {e}")
            logger.error(traceback.format_exc())
            return None

    def create_groups(self):
        """Step 5: Groups"""
        logger.info("PolygonProcessor: Step 5 - Grouping")
        
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
                logger.error(f"PolygonProcessor: Grouping error: {e}")
                
        save_to_redis(KEY_GROUPS, groups)
        return groups
