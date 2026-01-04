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
