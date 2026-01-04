"""
Unified state handler for CrazyWalk-Game server.
Combines game_state and location_state into single endpoint with backend restoration logic.
"""
import json
import logging
import urllib.parse

logger = logging.getLogger(__name__)


def handle_unified_state(handler, method='GET'):
    """
    Handle /api/unified_state
    GET: Returns complete ready-to-render state (geometry + progress + position)
    POST: Saves complete state to Redis
    
    Query params (GET):
        lat, lon: coordinates for location key generation
        
    This replaces separate calls to /api/game_state and /api/location_state
    """
    from CORE.BACKEND.redis_tools import get_redis_client, KEY_GAME_STATE
    
    if method == 'GET':
        _handle_get_unified_state(handler)
    else:
        _handle_post_unified_state(handler)


def _handle_get_unified_state(handler):
    """GET: Return unified state with all data ready for rendering."""
    try:
        from CORE.BACKEND.redis_tools import get_redis_client, KEY_GAME_STATE
        
        # Parse coordinates
        parsed_path = urllib.parse.urlparse(handler.path)
        params = urllib.parse.parse_qs(parsed_path.query)
        lat = params.get('lat', [None])[0]
        lon = params.get('lon', [None])[0]
        
        r = get_redis_client()
        
        # 1. Load global game state (geometry)
        game_state = None
        game_data = r.get(KEY_GAME_STATE)
        if game_data:
            game_state = json.loads(game_data)
        
        # 2. Determine location_key - from params or from saved game_state
        location_key = None
        if lat and lon:
            location_key = f"{float(lat):.3f}_{float(lon):.3f}"
        elif game_state and game_state.get("last_location_key"):
            # Use saved location_key if no coords provided (initial load)
            location_key = game_state.get("last_location_key")
            logger.info(f"UNIFIED_STATE: Using saved location_key: {location_key}")
        
        # 3. Load location state (progress) using location_key
        location_state = None
        if location_key:
            redis_key = f"location:{location_key}:state"
            loc_data = r.get(redis_key)
            if loc_data:
                location_state = json.loads(loc_data)
                logger.info(f"UNIFIED_STATE: Loaded location_state for {location_key}")
        
        # 4. Load GIF assignments from Redis
        gif_assignments = {}
        gif_data = r.get("game:gif_assignments")
        if gif_data:
            gif_assignments = json.loads(gif_data)
        
        # 4. Build unified response
        response = {
            "ready_to_render": True,
            "location_key": location_key,
            
            # Geometry (from game_state)
            "polygons": game_state.get("polygons", []) if game_state else [],
            "white_lines": game_state.get("white_lines", []) if game_state else [],
            "green_circles": game_state.get("green_circles", []) if game_state else [],
            "blue_circles": game_state.get("blue_circles", []) if game_state else [],
            "poster_grid": game_state.get("poster_grid", []) if game_state else [],
            "groups": game_state.get("groups", []) if game_state else [],
            
            # Progress (from location_state)
            "collected_circles": location_state.get("collected_circles", []) if location_state else [],
            "visible_polygon_ids": location_state.get("visible_polygon_ids", []) if location_state else [],
            "expanded_circles": location_state.get("expanded_circles", []) if location_state else [],
            "user_position": location_state.get("user_position") if location_state else None,
            "current_circle_uid": location_state.get("current_circle_uid") if location_state else None,
            
            # GIF assignments (centralized)
            "promo_gif_map": gif_assignments,
            
            # Status
            "has_saved_state": game_state is not None and len(game_state.get("polygons", [])) > 0
        }
        
        polygon_count = len(response["polygons"])
        logger.info(f"UNIFIED_STATE: Returned {polygon_count} polygons, location={location_key}")
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps(response).encode())
        
    except Exception as e:
        logger.error(f"Unified State GET Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        handler.send_error(500, str(e))


def _handle_post_unified_state(handler):
    """POST: Save unified state to Redis."""
    try:
        from CORE.BACKEND.redis_tools import get_redis_client, KEY_GAME_STATE
        import time
        
        content_length = int(handler.headers.get('Content-Length', 0))
        body = handler.rfile.read(content_length)
        state = json.loads(body.decode())
        
        r = get_redis_client()
        
        # 1. Save geometry to game_state (with last_location_key for initial load)
        polygons = state.get('polygons', [])
        location_key = state.get("location_key")
        if polygons:
            game_state = {
                "polygons": polygons,
                "white_lines": state.get("white_lines", []),
                "green_circles": state.get("green_circles", []),
                "blue_circles": state.get("blue_circles", []),
                "poster_grid": state.get("poster_grid", []),
                "groups": state.get("groups", []),
                "last_location_key": location_key  # Store for initial load restoration
            }
            r.set(KEY_GAME_STATE, json.dumps(game_state))
            r.expire(KEY_GAME_STATE, 60 * 60 * 24 * 7)  # 7 days
        
        # 2. Save progress to location_state
        if location_key:
            location_state = {
                "collected_circles": state.get("collected_circles", []),
                "visible_polygon_ids": state.get("visible_polygon_ids", []),
                "expanded_circles": state.get("expanded_circles", []),
                "user_position": state.get("user_position"),
                "current_circle_uid": state.get("current_circle_uid")
            }
            redis_key = f"location:{location_key}:state"
            r.set(redis_key, json.dumps(location_state))
            r.expire(redis_key, 60 * 60 * 24 * 7)
        
        # 3. Save GIF assignments separately
        gif_map = state.get("promo_gif_map", {})
        if gif_map:
            r.set("game:gif_assignments", json.dumps(gif_map))
            r.expire("game:gif_assignments", 60 * 60 * 24 * 7)
        
        logger.info(f"UNIFIED_STATE: Saved {len(polygons)} polygons, location={location_key}")
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "status": "ok",
            "saved_polygons": len(polygons),
            "location_key": location_key
        }).encode())
        
    except Exception as e:
        logger.error(f"Unified State POST Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        handler.send_error(500, str(e))
