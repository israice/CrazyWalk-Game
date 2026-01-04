"""
Geometry utilities for CrazyWalk-Game.
Helper functions for geometric calculations using Shapely.
"""
import math
import logging
from shapely.geometry import Polygon, LineString, Point, box as ShapelyBox
from shapely.ops import unary_union

logger = logging.getLogger(__name__)


def haversine_distance(coord1, coord2):
    """
    Calculate the great-circle distance between two points on Earth.
    
    Args:
        coord1: (lat, lon) tuple
        coord2: (lat, lon) tuple
    
    Returns:
        Distance in meters
    """
    R = 6371000  # Earth radius in meters
    lat1, lon1 = math.radians(coord1[0]), math.radians(coord1[1])
    lat2, lon2 = math.radians(coord2[0]), math.radians(coord2[1])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c


def can_fit_circle(coords, radius_meters=15):
    """
    Check if a circle with given radius can fit entirely inside the polygon.
    
    Args:
        coords: Polygon coordinates in [lat, lon] format
        radius_meters: Radius of circle to fit (default 15m)
    
    Returns:
        bool: True if circle fits
    """
    try:
        # Swap from [lat, lon] to (lon, lat) for Shapely
        shapely_coords = [(c[1], c[0]) for c in coords]

        poly = Polygon(shapely_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)
        if poly.is_empty or poly.area == 0:
            return False

        centroid = poly.centroid

        if not poly.contains(centroid):
            return False

        boundary = poly.exterior
        min_distance_deg = centroid.distance(boundary)
        min_distance_meters = min_distance_deg * 111000

        return min_distance_meters >= radius_meters
    except Exception as e:
        logger.warning(f"can_fit_circle error: {e}")
        return True


def can_fit_debug_box(coords, center, label_direction):
    """
    Check if the debug box (bounding box of both circles) fits entirely inside the polygon.
    
    Args:
        coords: Polygon coordinates in [lat, lon] format
        center: Polygon center as (lat, lon) tuple
        label_direction: Direction dict with 'angle' in radians
    
    Returns:
        bool: True if debug box fits entirely inside polygon
    """
    try:
        shapely_coords = [(c[1], c[0]) for c in coords]
        poly = Polygon(shapely_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)

        center_point = (center[1], center[0])
        angle = label_direction.get('angle', 0)

        # Calculate offset for small circle
        offset_distance = 45 / 111000
        offset_x = math.cos(angle) * offset_distance
        offset_y = math.sin(angle) * offset_distance

        small_center_x = center_point[0] + offset_x
        small_center_y = center_point[1] + offset_y

        large_radius = 30 / 111000
        small_radius = 15 / 111000

        min_x = min(center_point[0] - large_radius, small_center_x - small_radius)
        max_x = max(center_point[0] + large_radius, small_center_x + small_radius)
        min_y = min(center_point[1] - large_radius, small_center_y - small_radius)
        max_y = max(center_point[1] + large_radius, small_center_y + small_radius)

        debug_box = ShapelyBox(min_x, min_y, max_x, max_y)

        return poly.contains(debug_box)

    except Exception as e:
        logger.warning(f"can_fit_debug_box error: {e}")
        return True


def get_blue_lines(coords, center, label_direction, boundary_white_lines):
    """
    Get list of white lines that the debug box touches (blue lines).
    
    Returns:
        set: Set of line IDs that intersect with debug box
    """
    try:
        shapely_coords = [(c[1], c[0]) for c in coords]
        poly = Polygon(shapely_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)

        center_point = (center[1], center[0])
        angle = label_direction.get('angle', 0)

        offset_distance = 45 / 111000
        offset_x = math.cos(angle) * offset_distance
        offset_y = math.sin(angle) * offset_distance

        small_center_x = center_point[0] + offset_x
        small_center_y = center_point[1] + offset_y

        large_radius = 30 / 111000
        small_radius = 15 / 111000

        min_x = min(center_point[0] - large_radius, small_center_x - small_radius)
        max_x = max(center_point[0] + large_radius, small_center_x + small_radius)
        min_y = min(center_point[1] - large_radius, small_center_y - small_radius)
        max_y = max(center_point[1] + large_radius, small_center_y + small_radius)

        debug_box = ShapelyBox(min_x, min_y, max_x, max_y)

        blue_lines = set()
        if not poly.contains(debug_box):
            blue_lines = set(boundary_white_lines)

        return blue_lines

    except Exception as e:
        logger.warning(f"get_blue_lines error: {e}")
        return set()


def calculate_label_position(coords, center):
    """
    Calculate the optimal direction for positioning the small circle.
    
    Args:
        coords: Polygon coordinates in [lat, lon] format
        center: Polygon center as (lat, lon) tuple
    
    Returns:
        dict with 'angle' (radians) and 'max_distance' (degrees)
    """
    try:
        if not coords or len(coords) < 3:
            return {'angle': 0, 'max_distance': 0}

        shapely_coords = [(c[1], c[0]) for c in coords]
        poly = Polygon(shapely_coords)
        if not poly.is_valid:
            poly = poly.buffer(0)

        center_point = (center[1], center[0])

        num_samples = 8
        max_distance = 0
        best_angle = 0
        
        boundary = poly.boundary

        for i in range(num_samples):
            angle = (i * 2 * math.pi) / num_samples

            far_distance = 0.01
            far_point = (
                center_point[0] + math.cos(angle) * far_distance,
                center_point[1] + math.sin(angle) * far_distance
            )

            ray = LineString([center_point, far_point])
            intersection = ray.intersection(boundary)

            if not intersection.is_empty:
                if intersection.geom_type == 'Point':
                    dist = Point(center_point).distance(intersection)
                    if dist > max_distance:
                        max_distance = dist
                        best_angle = angle
                elif intersection.geom_type == 'MultiPoint':
                    min_dist = min(Point(center_point).distance(Point(pt)) for pt in intersection.geoms)
                    if min_dist > max_distance:
                        max_distance = min_dist
                        best_angle = angle

        return {
            'angle': best_angle,
            'max_distance': max_distance
        }

    except Exception as e:
        logger.warning(f"calculate_label_position error: {e}")
        return {'angle': 0, 'max_distance': 0}


def merge_polygons(poly_a, poly_b, shared_line_id, white_lines_map, calculate_label_fn):
    """
    Merge two polygons by combining their geometries.
    
    Args:
        poly_a: First polygon dict
        poly_b: Second polygon dict
        shared_line_id: ID of shared line being removed
        white_lines_map: Map of line_id -> line dict
        calculate_label_fn: Function to calculate label position
    
    Returns:
        New merged polygon dict or None if merge fails
    """
    try:
        coords_a = [(c[1], c[0]) for c in poly_a['coords']]
        coords_b = [(c[1], c[0]) for c in poly_b['coords']]
        
        geom_a = Polygon(coords_a)
        geom_b = Polygon(coords_b)
        
        if not geom_a.is_valid:
            geom_a = geom_a.buffer(0)
        if not geom_b.is_valid:
            geom_b = geom_b.buffer(0)
        
        area_a = poly_a.get('_largest_original_area', geom_a.area)
        area_b = poly_b.get('_largest_original_area', geom_b.area)
        center_a = poly_a.get('_largest_original_center', poly_a.get('center', (0, 0)))
        center_b = poly_b.get('_largest_original_center', poly_b.get('center', (0, 0)))
        
        if area_a >= area_b:
            largest_original_area = area_a
            largest_original_center = center_a
        else:
            largest_original_area = area_b
            largest_original_center = center_b
        
        eps = 1e-7
        merged_geom = unary_union([geom_a.buffer(eps), geom_b.buffer(eps)]).buffer(-eps)
        
        if merged_geom.is_empty:
            return None
        
        if merged_geom.geom_type == 'MultiPolygon':
            merged_geom = max(merged_geom.geoms, key=lambda g: g.area)
        
        shapely_coords = list(merged_geom.exterior.coords)
        new_coords = [[c[1], c[0]] for c in shapely_coords]
        
        lines_a = set(poly_a.get('boundary_white_lines', []))
        lines_b = set(poly_b.get('boundary_white_lines', []))
        combined_lines = lines_a ^ lines_b

        # Validate lines on boundary
        validated_lines = []
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

        combined_lines = validated_lines
        total_pts = poly_a.get('total_points', 0) + poly_b.get('total_points', 0)

        new_center = merged_geom.centroid
        new_center_tuple = (new_center.y, new_center.x)
        new_label_direction = calculate_label_fn(new_coords, new_center_tuple)

        clat = round(new_center.y, 5)
        clon = round(new_center.x, 5)
        new_stable_id = f"poly_{clat}_{clon}".replace('.', '')

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
        logger.error(f"merge_polygons error: {e}")
        return None
