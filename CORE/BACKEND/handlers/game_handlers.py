"""
Game data handler for CrazyWalk-Game server.
Handles generation and retrieval of map game data.
"""
import json
import logging
import time
import urllib.parse

logger = logging.getLogger(__name__)


def handle_game_data(handler):
    """
    Handle /api/game_data.
    Generates/Retrieves game elements (Lines, Polygons).
    """
    try:
        parsed_path = urllib.parse.urlparse(handler.path)
        params = urllib.parse.parse_qs(parsed_path.query)
        lat = float(params.get('lat', [0])[0])
        lon = float(params.get('lon', [0])[0])
        rebuild_param = params.get('rebuild', ['false'])[0].lower()
        mode_param = params.get('mode', ['initial'])[0]
        restored_polygon_ids_param = params.get('restored_polygon_ids', [None])[0]

        # Parse restored polygon IDs if provided
        restored_polygon_ids = None
        if restored_polygon_ids_param:
            restored_polygon_ids = [pid.strip() for pid in restored_polygon_ids_param.split(',') if pid.strip()]
            logger.info(f"Restoring {len(restored_polygon_ids)} previously visible polygons")

        force_rebuild = rebuild_param == 'true'

        if not lat or not lon:
            handler.send_error(400, "Missing lat/lon")
            return

        # Import and Reload to ensure fresh code
        import importlib
        from CORE.BACKEND import LocationPolygonsGenerator

        importlib.reload(LocationPolygonsGenerator)

        # Generate Data
        t0 = time.perf_counter()
        generator = LocationPolygonsGenerator.LocationPolygonsGenerator()
        data = generator.generate_map(lat, lon, force_rebuild=force_rebuild, mode=mode_param, restored_polygon_ids=restored_polygon_ids)

        # --- IS_COMPLETED LOGIC INJECTION ---
        # Load user progress from Redis to determine which polygons are completed
        try:
            from CORE.BACKEND.redis_tools import get_redis_client
            
            # 1. Determine location key for current request
            location_key = f"{lat:.3f}_{lon:.3f}"
            redis_key = f"location:{location_key}:state"
            
            r = get_redis_client()
            loc_data = r.get(redis_key)
            
            collected_keys = set()
            if loc_data:
                loc_state = json.loads(loc_data)
                collected_list = loc_state.get("collected_circles", [])
                collected_keys = set(collected_list)
                logger.info(f"Loaded {len(collected_keys)} collected circles for completion check (Loc: {location_key})")
            
            # 2. Check overlap for each polygon
            if 'polygons' in data and data['polygons']:
                for poly in data['polygons']:
                    total_points = poly.get('total_points', 0)
                    coords = poly.get('coords', [])
                    
                    if not coords:
                        poly['is_completed'] = False
                        continue

                    # Count how many points match collected keys
                    matches = 0
                    for c in coords:
                        # Format must match frontend: toFixed(6) -> f"{val:.6f}"
                        # Point c is [lat, lon]
                        key = f"{c[0]:.6f},{c[1]:.6f}"
                        if key in collected_keys:
                            matches += 1
                    
                    # Logic: is_completed if we collected enough points
                    is_completed = (matches >= len(coords)) # Strict check based on geometry vertices
                    
                    poly['is_completed'] = is_completed

            # 3. White Line Visibility Logic
            # Collect sets of completed polygon IDs/UIDs for fast lookup
            completed_poly_uids = set()
            if 'polygons' in data and data['polygons']:
                for poly in data['polygons']:
                    if poly.get('is_completed'):
                        if poly.get('uid'):
                            completed_poly_uids.add(poly['uid'])
                        if poly.get('id'): # Support legacy ID just in case
                            completed_poly_uids.add(str(poly['id']))
            
            # Update white lines
            if 'white_lines' in data and data['white_lines']:
                for line in data['white_lines']:
                    connected = line.get('connected_polygon_ids', [])
                    if not connected:
                        line['is_visible'] = True # Default visible if no info
                        continue
                        
                    # Line is visible UNLESS ALL connected polygons are completed
                    # Check if every connected poly ID is in our completed set
                    all_neighbors_completed = True
                    for pid in connected:
                        # pid might be int or str, ensure str for set lookup
                        if str(pid) not in completed_poly_uids:
                            all_neighbors_completed = False
                            break
                    
                    line['is_visible'] = not all_neighbors_completed
                    
        except Exception as e:
            logger.error(f"Error injecting game state logic: {e}")
            # Fallback: ensure flags exist
            if 'polygons' in data:
                for p in data['polygons']:
                    if 'is_completed' not in p: p['is_completed'] = False
            if 'white_lines' in data:
                for l in data['white_lines']:
                    if 'is_visible' not in l: l['is_visible'] = True


        t1 = time.perf_counter()
        logger.info(f"PERF: handle_game_data total took {t1 - t0:.4f}s")
        
        # Send Response
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        
        handler.wfile.write(json.dumps(data).encode())
        
    except Exception as e:
        logger.error(f"Game Data Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        handler.send_error(500, str(e))
