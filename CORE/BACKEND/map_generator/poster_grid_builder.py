import logging
import os
import random
from CORE.BACKEND.redis_tools import save_to_redis, load_from_redis
from CORE.BACKEND.uid_utils import generate_uid, UIDPrefix

logger = logging.getLogger(__name__)

class PosterGridBuilder:
    def __init__(self, data_dir):
        self.data_dir = data_dir

    def build_grid(self, lat, lon, polygons):
        """
        Creates a 3x3 poster grid centered on geometric center of polygons.
        Assigns intersecting posters to polygons.
        """
        logger.info("PosterGridBuilder: Building Poster Grid")
        
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
            
            # Fixed poster size (same as before: ~333m lat, ~444m lon)
            POSTER_LAT_SIZE = 0.003
            POSTER_LON_SIZE = 0.004
            
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
                # Fallback to simulated IDs if empty
                available_images = [f"{i}.jpg" for i in range(1, 10)]

            # --- POSTER PERSISTENCE ---
            # Check Redis for existing poster assignment for this location
            # Key based on input lat/lon (rounded to ~1m precision to handle float drift)
            poster_cache_key = f"game:posters:{round(lat, 6)}_{round(lon, 6)}"
            cached_selected_images = load_from_redis(poster_cache_key)
            
            if cached_selected_images:
                # logger.info(f"Reusing persisted posters for {lat}, {lon}")
                selected_images = cached_selected_images
            else:
                # Select 9 images. 
                if len(available_images) >= 9:
                    selected_images = random.sample(available_images, 9)
                else:
                    logger.warning(f"Only {len(available_images)} posters found. Repeating to fill grid.")
                    selected_images = [available_images[i % len(available_images)] for i in range(9)]
                    random.shuffle(selected_images)
                
                # Save to Redis
                save_to_redis(poster_cache_key, selected_images, expiration=None)
                logger.info(f"Persisted new poster selection for {lat}, {lon}")

            # Create 3x3 grid (9 posters)
            poster_grid = []
            img_idx = 0
            for row in range(2, -1, -1):  # Start from row 2 (top) down to row 0 (bottom)
                for col in range(3):
                    # Simple formula: row 2 = IDs 7,8,9; row 1 = IDs 4,5,6; row 0 = IDs 1,2,3
                    poster_id = generate_uid(UIDPrefix.POSTER)
                    poster_position = row * 3 + col + 1
                    
                    image_filename = selected_images[img_idx]
                    img_idx += 1
                    
                    poster = {
                        'id': poster_id,
                        'position': poster_position,
                        'min_lat': start_lat + row * POSTER_LAT_SIZE,
                        'max_lat': start_lat + (row + 1) * POSTER_LAT_SIZE,
                        'min_lon': start_lon + col * POSTER_LON_SIZE,
                        'max_lon': start_lon + (col + 1) * POSTER_LON_SIZE,
                        'image_url': f'/GAME_POSTERS/{image_filename}'
                    }
                    poster_grid.append(poster)
            
            logger.info(f"Created 3x3 poster grid (9 posters)")
            
            # --- ASSIGN POSTERS TO POLYGONS ---
            # Calculate which posters intersect with each polygon
            for poly in polygons:
                poly_coords = poly.get('coords', [])
                if not poly_coords:
                    poly['poster_ids'] = []
                    continue
                
                poly_min_lat = min(coord[0] for coord in poly_coords)
                poly_max_lat = max(coord[0] for coord in poly_coords)
                poly_min_lon = min(coord[1] for coord in poly_coords)
                poly_max_lon = max(coord[1] for coord in poly_coords)
                
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
            return poster_grid
        else:
            return None
