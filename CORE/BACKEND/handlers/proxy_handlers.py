"""
Proxy handlers for CrazyWalk-Game server.
Proxies requests to external APIs to avoid CORS issues.
"""
import json
import logging
import urllib.request
import urllib.parse

logger = logging.getLogger(__name__)


def proxy_nominatim(handler):
    """Proxy requests to Nominatim to avoid CORS."""
    try:
        parsed_path = urllib.parse.urlparse(handler.path)
        params = urllib.parse.parse_qs(parsed_path.query)
        
        if handler.path.startswith('/api/reverse'):
            lat = params.get('lat', [None])[0]
            lon = params.get('lon', [None])[0]
            if not lat or not lon:
                handler.send_error(400, "Missing lat/lon")
                return
            target_url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&accept-language=en"
            
        elif handler.path.startswith('/api/search'):
            q = params.get('q', [None])[0]
            limit = params.get('limit', ['1'])[0]
            if not q:
                handler.send_error(400, "Missing query")
                return
            encoded_q = urllib.parse.quote(q)
            target_url = f"https://nominatim.openstreetmap.org/search?format=json&q={encoded_q}&limit={limit}&accept-language=en"
        
        req = urllib.request.Request(target_url, headers={'User-Agent': 'CrazyWalk/1.0'})
        
        with urllib.request.urlopen(req) as response:
            data = response.read()
            
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', '*')
        handler.end_headers()
        handler.wfile.write(data)
        
    except Exception as e:
        logger.error(f"Proxy error: {e}")
        handler.send_error(500, f"Proxy error: {str(e)}")
