import logging
import os
import time
from .redis_tools import load_from_redis

from .map_generator.overpass_provider import fetch_red_lines
from .map_generator.graph_builder import identify_intersections, create_graph_elements
from .map_generator.polygon_processor import PolygonProcessor
from .map_generator.poster_grid_builder import PosterGridBuilder
from .map_generator.graph_enricher import enrich_graph_elements
from .map_generator.map_filter import MapFilter

logger = logging.getLogger(__name__)

class LocationPolygonsGenerator:
    """
    Unified generator for CrazyWalk game map data.
    Orchestrates the map generation pipeline using modular components.
    """
    
    def __init__(self):
        self.data_dir = os.path.dirname(__file__)
        self.polygon_processor = PolygonProcessor(self.data_dir)
        self.poster_grid_builder = PosterGridBuilder(self.data_dir)
        self.map_filter = MapFilter()

    def generate_map(self, lat, lon, region_size=0.0015, force_rebuild=False, mode='initial', restored_polygon_ids=None):
        logger.info(f">>> generate_map CALLED: lat={lat}, lon={lon}, force_rebuild={force_rebuild}, mode={mode}")

        # --- CACHE CHECK (only for initial mode) ---
        cache_lat = round(lat, 3)
        cache_lon = round(lon, 3)
        cache_key = f"map_cache:{cache_lat}_{cache_lon}"
        
        if mode == 'initial' and not force_rebuild:
            cached_data = load_from_redis(cache_key)
            if cached_data:
                logger.info(f"✅ CACHE HIT: Returning cached map data for {cache_key}")
                return cached_data
            else:
                logger.info(f"❌ CACHE MISS: Generating...")
        
        REGION_SIZES = [0.0015, 0.005, 0.01]
        
        for attempt, size in enumerate(REGION_SIZES, 1):
            t0 = time.perf_counter()
            meters = int(size * 111000)
            logger.info("========================================")
            logger.info(f"GPS POLYGON ATTEMPT {attempt}/3: region_size={size} (~{meters}m)")
            
            # 1. Red Lines (Overpass)
            red_segments, red_visual = fetch_red_lines(lat, lon, size, reuse_existing=False, mode=mode)
            t1 = time.perf_counter()
            
            if not red_visual and not red_segments:
                logger.warning(f"ATTEMPT {attempt}/3: No roads found")
                if attempt < len(REGION_SIZES): continue
                else: return {"error": "NO_ROADS", "message": "No roads found"}
            
            # 2. Blue Circles
            blue_circles, adjacency, relevant_nodes = identify_intersections()
            t2 = time.perf_counter()
            
            # 3. White Lines + Green Circles
            white_lines, green_circles = create_graph_elements()
            t3 = time.perf_counter()
            
            # 4. Polygons
            polygons, used_white_line_ids = self.polygon_processor.find_polygons()
            t4 = time.perf_counter()
            
            if not polygons:
                logger.warning(f"ATTEMPT {attempt}/3: No polygons created")
                if attempt < len(REGION_SIZES): continue
                else: return {"error": "NO_POLYGONS", "message": "No polygons created"}
            
            logger.info(f"ATTEMPT {attempt}/3: SUCCESS! {len(polygons)} polygons")
            
            # 5. Poster Grid
            poster_grid = self.poster_grid_builder.build_grid(lat, lon, polygons)
            
            # 6. Groups
            groups = self.polygon_processor.create_groups()
            
            # 7. Enrich Graph (Calculate connections on FULL set)
            enrich_graph_elements(polygons, white_lines, blue_circles, green_circles)
            
            # 8. Filter & Recalculate Stats (for specific mode)
            polygons, white_lines, blue_circles, green_circles = self.map_filter.filter_data(
                mode, lat, lon, restored_polygon_ids, 
                polygons, white_lines, blue_circles, green_circles
            )
            
            t5 = time.perf_counter()
            logger.info(f"PERF: Total time: {t5 - t0:.4f}s")
            
            # --- STANDARDIZE OUTPUT: Ensure 'uid' exists (alias 'id' if needed) ---
            for collection in [polygons, white_lines, blue_circles, green_circles, groups]:
                if collection:
                    for item in collection:
                        if 'uid' not in item and 'id' in item:
                            item['uid'] = item['id']

            return {
                "polygons": polygons,
                "white_lines": white_lines,
                "blue_circles": blue_circles,
                "green_circles": green_circles,
                "red_lines": red_visual,
                "groups": groups,
                "poster_grid": poster_grid
            }
        
        return {"error": "FAILED", "message": "Failed to generate map after 3 attempts"}
