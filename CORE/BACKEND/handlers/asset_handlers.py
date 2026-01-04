"""
Asset handlers for CrazyWalk-Game server.
Serves static assets like posters, promos, and README.
"""
import os
import json
import logging

logger = logging.getLogger(__name__)


def handle_serve_poster(handler):
    """Serve images from CORE/DATA/GAME_POSTERS."""
    try:
        filename = os.path.basename(handler.path)
        poster_path = os.path.join(os.getcwd(), 'CORE', 'DATA', 'GAME_POSTERS', filename)
        
        logger.info(f"Attempting to serve poster: {poster_path}")

        if not os.path.exists(poster_path):
            logger.error(f"POSTER NOT FOUND on disk: {poster_path}")
            handler.send_error(404, "Poster Not Found")
            return
            
        if not filename.lower().endswith(('.jpg', '.jpeg', '.png')):
            logger.error(f"INVALID POSTER EXTENSION: {filename}")
            handler.send_error(404, "Invalid Extension")
            return
            
        handler.send_response(200)
        handler.send_header('Content-Type', 'image/jpeg')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.send_header('Cache-Control', 'public, max-age=86400')
        handler.end_headers()
        
        with open(poster_path, 'rb') as f:
            handler.wfile.write(f.read())
    except Exception as e:
        logger.error(f"Error serving poster: {e}")
        handler.send_error(500, str(e))


def handle_serve_promo(handler):
    """Serve GIFs from CORE/DATA/GAME_PROMOS."""
    try:
        filename = os.path.basename(handler.path)
        promo_path = os.path.join(os.getcwd(), 'CORE', 'DATA', 'GAME_PROMOS', filename)
        
        logger.info(f"Attempting to serve promo: {promo_path}")

        if not os.path.exists(promo_path):
            logger.error(f"PROMO NOT FOUND on disk: {promo_path}")
            handler.send_error(404, "Promo Not Found")
            return
            
        if not filename.lower().endswith('.gif'):
            logger.error(f"INVALID PROMO EXTENSION: {filename}")
            handler.send_error(404, "Invalid Extension")
            return
            
        handler.send_response(200)
        handler.send_header('Content-Type', 'image/gif')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.send_header('Cache-Control', 'public, max-age=86400')
        handler.end_headers()
        
        with open(promo_path, 'rb') as f:
            handler.wfile.write(f.read())
    except Exception as e:
        logger.error(f"Error serving promo: {e}")
        handler.send_error(500, str(e))


def handle_get_promos(handler):
    """
    Handle GET /api/promos
    Returns list of GIF filenames from CORE/DATA/GAME_PROMOS
    """
    try:
        promos_dir = os.path.join(os.getcwd(), 'CORE', 'DATA', 'GAME_PROMOS')
        if not os.path.exists(promos_dir):
            logger.warning(f"Promos directory not found: {promos_dir}")
            file_list = []
        else:
            files = os.listdir(promos_dir)
            file_list = [f for f in files if f.lower().endswith('.gif')]
        
        logger.info(f"Retrieved {len(file_list)} promo GIFs")
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(json.dumps(file_list).encode())
        
    except Exception as e:
        logger.error(f"Get Promos Error: {e}")
        handler.send_error(500, str(e))


def handle_serve_readme(handler):
    """Serve README.md from project root for version badge."""
    try:
        readme_path = os.path.join(os.getcwd(), 'README.md')
        
        if not os.path.exists(readme_path):
            logger.error(f"README.md not found: {readme_path}")
            handler.send_error(404, "README.md Not Found")
            return
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'text/markdown; charset=utf-8')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.send_header('Cache-Control', 'no-cache')
        handler.end_headers()
        
        with open(readme_path, 'rb') as f:
            handler.wfile.write(f.read())
            
    except Exception as e:
        logger.error(f"Error serving README.md: {e}")
        handler.send_error(500, str(e))
