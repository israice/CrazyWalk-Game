import math
import logging
from shapely.geometry import Polygon, LineString, Point, box as ShapelyBox

logger = logging.getLogger(__name__)

def haversine_distance(coord1, coord2):
    R = 6371000 # meters
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
            logger.info(f"can_fit_circle: empty/zero area polygon")
            return False

        centroid = poly.centroid

        # Check if centroid is inside polygon
        if not poly.contains(centroid):
            logger.info(f"can_fit_circle: centroid outside polygon")
            return False

        # Calculate minimum distance from centroid to polygon boundary
        boundary = poly.exterior
        min_distance_deg = centroid.distance(boundary)

        # Convert to meters (approximate: 1 degree ≈ 111km at equator)
        min_distance_meters = min_distance_deg * 111000

        fits = min_distance_meters >= radius_meters

        # Always log for debugging
        logger.info(f"can_fit_circle: min_dist={min_distance_meters:.2f}m, radius={radius_meters}m, fits={fits}")

        return fits
    except Exception as e:
        logger.warning(f"can_fit_circle error: {e}")
        return True  # Assume fits if check fails

def get_blue_lines(coords, center, label_direction, boundary_white_lines):
    """
    Get list of white lines that the debug box touches (blue lines).

    Returns:
        set: Set of line IDs that intersect with debug box
    """
    try:
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
        
        # Simple check: if debug box doesn't fit, all lines are potentially blue
        if not poly.contains(debug_box):
            blue_lines = set(boundary_white_lines)

        return blue_lines

    except Exception as e:
        logger.warning(f"get_blue_lines error: {e}")
        return set()

def can_fit_debug_box(coords, center, label_direction):
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

        logger.info(f"can_fit_debug_box: center=({center[0]:.6f}, {center[1]:.6f}), "
                   f"angle={math.degrees(angle):.1f}°, fits={fits}")

        return fits

    except Exception as e:
        logger.warning(f"can_fit_debug_box error: {e}")
        return True  # Assume fits if check fails

def calculate_label_position(coords, center):
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

        return {
            'angle': best_angle,
            'max_distance': max_distance
        }

    except Exception as e:
        logger.warning(f"calculate_label_position error: {e}, using default")
        return {'angle': 0, 'max_distance': 0}
