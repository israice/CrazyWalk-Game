"""
State handlers for CrazyWalk-Game server.
Handles saving and retrieving game state and location state via Redis.
"""
import json
import logging
import time
import urllib.parse

logger = logging.getLogger(__name__)


def handle_save_location_state(handler):
    """
    Handle POST /api/location_state
    Saves complete game state for a location to Redis.
    """
    try:
        from CORE.BACKEND.redis_tools import get_redis_client

        # Read POST body
        content_length = int(handler.headers.get('Content-Length', 0))
        body = handler.rfile.read(content_length)
        data = json.loads(body.decode())

        location_key = data.get('location_key')
        collected_circles = data.get('collected_circles', [])
        visible_polygon_ids = data.get('visible_polygon_ids', [])
        expanded_circles = data.get('expanded_circles', [])
        blue_circles = data.get('blue_circles', [])
        user_position = data.get('user_position', None)
        promo_gif_map = data.get('promo_gif_map', {})

        if not location_key:
            handler.send_error(400, "Missing location_key")
            return

        # Save COMPLETE STATE to Redis with 7-day TTL
        redis_key = f"location:{location_key}:state"
        r = get_redis_client()

        complete_state = {
            'collected_circles': collected_circles,
            'visible_polygon_ids': visible_polygon_ids,
            'expanded_circles': expanded_circles,
            'blue_circles': blue_circles,
            'user_position': user_position,
            'promo_gif_map': promo_gif_map
        }

        if collected_circles or visible_polygon_ids or expanded_circles or blue_circles or promo_gif_map:
            r.set(redis_key, json.dumps(complete_state))
            r.expire(redis_key, 60 * 60 * 24 * 7)  # 7 days
            logger.info(f"Saved state for location {location_key}")
        else:
            r.delete(redis_key)
            logger.info(f"Cleared state for location {location_key}")

        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "status": "ok",
            "saved_circles": len(collected_circles),
            "saved_polygons": len(visible_polygon_ids),
            "saved_expanded": len(expanded_circles)
        }).encode())
        
    except Exception as e:
        logger.error(f"Save Location State Error: {e}")
        handler.send_error(500, str(e))


def handle_get_location_state(handler):
    """
    Handle GET /api/location_state?location_key=lat_lon
    Returns saved complete game state for a location.
    """
    try:
        from CORE.BACKEND.redis_tools import get_redis_client

        parsed_path = urllib.parse.urlparse(handler.path)
        params = urllib.parse.parse_qs(parsed_path.query)
        location_key = params.get('location_key', [None])[0]

        if not location_key:
            handler.send_error(400, "Missing location_key parameter")
            return

        redis_key = f"location:{location_key}:state"
        r = get_redis_client()
        data = r.get(redis_key)

        if data:
            state = json.loads(data)
            collected_circles = state.get('collected_circles', [])
            visible_polygon_ids = state.get('visible_polygon_ids', [])
            expanded_circles = state.get('expanded_circles', [])
            blue_circles = state.get('blue_circles', [])
            user_position = state.get('user_position', None)
            promo_gif_map = state.get('promo_gif_map', {})
            logger.info(f"Retrieved state for location {location_key}")
        else:
            collected_circles = []
            visible_polygon_ids = []
            expanded_circles = []
            blue_circles = []
            user_position = None
            promo_gif_map = {}
            logger.info(f"No state found for location {location_key}")

        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "location_key": location_key,
            "collected_circles": collected_circles,
            "visible_polygon_ids": visible_polygon_ids,
            "expanded_circles": expanded_circles,
            "blue_circles": blue_circles,
            "user_position": user_position,
            "promo_gif_map": promo_gif_map
        }).encode())
        
    except Exception as e:
        logger.error(f"Get Location State Error: {e}")
        handler.send_error(500, str(e))


def handle_get_game_state(handler):
    """
    Handle GET /api/game_state
    Returns COMPLETE game state from Redis including all geometry.
    """
    try:
        from CORE.BACKEND.redis_tools import get_redis_client, KEY_GAME_STATE

        r = get_redis_client()
        data = r.get(KEY_GAME_STATE)

        if data:
            state = json.loads(data)
            polygon_count = len(state.get('polygons', []))
            logger.info(f"Retrieved global game state: {polygon_count} polygons")
            
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(data.encode())
        else:
            logger.info("No global game state found - signaling fresh start")
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(json.dumps({"empty": True}).encode())

    except Exception as e:
        logger.error(f"Get Game State Error: {e}")
        handler.send_error(500, str(e))


def handle_save_game_state(handler):
    """
    Handle POST /api/game_state
    Saves COMPLETE game state including ALL geometry to Redis.
    """
    try:
        from CORE.BACKEND.redis_tools import get_redis_client, KEY_GAME_STATE

        content_length = int(handler.headers.get('Content-Length', 0))
        body = handler.rfile.read(content_length)
        state = json.loads(body.decode())

        r = get_redis_client()

        polygons = state.get('polygons', [])
        if not polygons:
            logger.warning("Attempted to save empty game state - ignoring")
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_header('Access-Control-Allow-Origin', '*')
            handler.end_headers()
            handler.wfile.write(json.dumps({"status": "ignored", "reason": "no polygons"}).encode())
            return

        t0 = time.perf_counter()
        r.set(KEY_GAME_STATE, json.dumps(state))
        r.expire(KEY_GAME_STATE, 60 * 60 * 24 * 7)  # 7 days
        t1 = time.perf_counter()
        logger.info(f"PERF: handle_save_game_state took {t1 - t0:.4f}s")

        logger.info(f"Saved global game state: {len(polygons)} polygons")

        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "status": "ok",
            "saved_polygons": len(polygons),
            "saved_lines": len(state.get('white_lines', [])),
            "saved_circles": len(state.get('collected_circles', []))
        }).encode())

    except Exception as e:
        logger.error(f"Save Game State Error: {e}")
        import traceback
        logger.error(traceback.format_exc())
        handler.send_error(500, str(e))
